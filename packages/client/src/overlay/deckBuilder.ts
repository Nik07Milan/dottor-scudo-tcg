// Deck builder (T5.3): overlay HTML a tutto schermo sopra la lobby. A sinistra le carte ammesse per
// l'eroe con filtri, a destra il mazzo. Regole dall'engine (decks/model.ts), salvataggio su Supabase.

import { HEROES_BY_ID, rules, type CardDefinition, type CardType } from "@dottorscudo/engine";
import type { Scene } from "phaser";
import {
  COST_FILTERS,
  TYPE_LABELS,
  addCard,
  canAdd,
  cardPool,
  copiesOf,
  deckRows,
  emptyDraft,
  filterPool,
  prebuiltDraft,
  removeCard,
  totalCards,
  validateDraft,
  type DeckDraft,
  type PoolFilter,
} from "../decks/model";
import { deleteDeck, listDecks, saveDeck, type SavedDeck } from "../decks/repo";
import { HEIGHT, WIDTH } from "../theme";
import { assetUrl } from "../ui/art";
import { el, ensureStyles } from "./dom";

const FACTION_CSS: Record<string, string> = { ufficio: "#2f6fb5", soci: "#a8323e", neutrale: "#6f7480" };
const RARITY_CSS: Record<string, string> = { common: "#dcdcdc", rare: "#3f8fe0", epic: "#a65de0", legendary: "#f2a93b", token: "#8a8f99" };

/** Apre il deck builder per un eroe. `onClose(changed)`: changed = almeno un mazzo salvato o eliminato. */
export function openDeckBuilder(scene: Scene, heroId: string, onClose: (changed: boolean) => void): void {
  ensureStyles();
  const hero = HEROES_BY_ID.get(heroId)!;
  const pool = cardPool(heroId);
  const types = [...new Set(pool.map((c) => c.type))];

  let decks: SavedDeck[] = [];
  let draft: DeckDraft = prebuiltDraft(heroId);
  let dirty = false;
  /** Modificato a mano dall'ultimo caricamento: chiudere chiede conferma. */
  let touched = false;
  let changed = false;
  let confirming: "delete" | "close" | null = null;
  const filter: PoolFilter = { text: "", cost: null, type: null };

  // Struttura fissa; si ridisegnano solo le parti che cambiano (così i campi di testo non perdono il fuoco).
  const tabs = el("div", { class: "ds-row", style: "flex: 1; flex-wrap: wrap; gap: 6px;" });
  const status = el("div", { class: "ds-muted", style: "min-height: 18px;" });
  const close = el("button", { class: "ds-secondary" }, "Chiudi");
  const search = el("input", { type: "search", placeholder: "Cerca per nome o testo…", style: "width: 240px;" });
  const costs = el("div", { class: "ds-row", style: "gap: 4px;" });
  const typeSelect = el(
    "select",
    {},
    el("option", { value: "" }, "Tutti i tipi"),
    ...types.map((t) => el("option", { value: t }, TYPE_LABELS[t])),
  );
  const grid = el("div", {
    style: "flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, 148px); gap: 10px; align-content: start; padding-right: 6px;",
  });
  const name = el("input", { maxLength: 40, placeholder: "Nome del mazzo", style: "width: 100%;" });
  const count = el("div", { style: "font-weight: bold;" });
  const list = el("div", { class: "ds-col", style: "flex: 1; overflow-y: auto; gap: 3px;" });
  const problems = el("div", { class: "ds-error", style: "min-height: 18px;" });
  const save = el("button", { style: "flex: 1;" }, "Salva");
  const remove = el("button", { class: "ds-danger" }, "Elimina");

  const root = el(
    "div",
    {
      class: "ds-ui",
      style: `width: ${WIDTH}px; height: ${HEIGHT}px; background: #1b1f2a; padding: 18px 22px; display: flex; flex-direction: column; gap: 12px;`,
    },
    el(
      "div",
      { class: "ds-row", style: "gap: 14px;" },
      el("div", { style: "font-size: 24px; font-weight: bold; color: #d8b26a; white-space: nowrap;" }, `Mazzi · ${hero.name}`),
      tabs,
      close,
    ),
    el(
      "div",
      { style: "flex: 1; min-height: 0; display: flex; gap: 16px;" },
      el("div", { class: "ds-col", style: "flex: 1; min-width: 0;" }, el("div", { class: "ds-row", style: "flex-wrap: wrap;" }, search, costs, typeSelect), grid),
      el(
        "div",
        { class: "ds-panel ds-col", style: "width: 330px;" },
        name,
        count,
        list,
        problems,
        el("div", { class: "ds-row" }, save, remove),
        status,
      ),
    ),
  );

  const setStatus = (text: string) => (status.textContent = text);

  const edit = (next: DeckDraft) => {
    if (next === draft) return;
    draft = next;
    dirty = true;
    touched = true;
    confirming = null;
    renderGrid();
    renderDeck();
  };

  const load = (next: DeckDraft) => {
    draft = next;
    dirty = !next.id; // una copia del precostruito o un mazzo nuovo non sono ancora salvati
    touched = false;
    confirming = null;
    name.value = draft.name;
    renderTabs();
    renderGrid();
    renderDeck();
  };

  function renderTabs(): void {
    tabs.replaceChildren(
      ...decks.map((d) =>
        el("button", { class: d.id === draft.id ? "" : "ds-secondary", onclick: () => load(structuredClone(d)) }, d.name),
      ),
      el("button", { class: "ds-secondary", onclick: () => load(emptyDraft(heroId)) }, "+ Nuovo"),
      el("button", { class: "ds-secondary", onclick: () => load(prebuiltDraft(heroId)) }, "Copia il precostruito"),
    );
  }

  function renderFilters(): void {
    const costButton = (label: string, value: number | null) =>
      el(
        "button",
        { class: filter.cost === value ? "" : "ds-secondary", style: "padding: 5px 9px;", onclick: () => ((filter.cost = value), renderFilters(), renderGrid()) },
        label,
      );
    costs.replaceChildren(costButton("Tutti", null), ...COST_FILTERS.map((c) => costButton(c === 7 ? "7+" : String(c), c)));
  }

  function renderGrid(): void {
    grid.replaceChildren(...filterPool(pool, filter).map(cardTile));
  }

  function cardTile(card: CardDefinition): HTMLElement {
    const copies = copiesOf(draft, card.id);
    const addable = canAdd(draft, card.id);
    const url = assetUrl(card.art);
    const focus = card.art?.includes("/avatar/") ? "22%" : "38%";
    const stats =
      card.type === "minion" ? `${card.attack} / ${card.health}` : card.type === "weapon" ? `${card.attack} / ${card.durability}` : "";
    return el(
      "div",
      {
        title: addable ? "Aggiungi al mazzo" : "",
        style: `position: relative; height: 214px; background: #f4eedc; color: #22262f; border: 3px solid ${FACTION_CSS[card.faction]}; border-radius: 10px; padding: 6px; display: flex; flex-direction: column; gap: 3px; cursor: ${addable ? "pointer" : "default"}; opacity: ${addable || copies > 0 ? 1 : 0.45};`,
        onclick: () => edit(addCard(draft, card.id)),
      },
      el("div", {
        style: `height: 64px; border-radius: 6px; background: #d9d2bd ${url ? `url("${url}") center ${focus} / cover` : ""};`,
      }),
      el(
        "div",
        { style: "position: absolute; top: 2px; left: 2px; width: 26px; height: 26px; border-radius: 50%; background: #3f8fe0; color: #fff; font-weight: bold; display: flex; align-items: center; justify-content: center; border: 2px solid #f4eedc;" },
        String(card.cost),
      ),
      copies > 0 &&
        el(
          "div",
          { style: "position: absolute; top: 4px; right: 4px; background: #22262f; color: #f4eedc; border-radius: 8px; padding: 1px 6px; font-size: 12px; font-weight: bold;" },
          `×${copies}`,
        ),
      el("div", { style: "font-weight: bold; font-size: 13px; line-height: 1.15;" }, card.name),
      el(
        "div",
        { style: "font-size: 11px; color: #5a6274; display: flex; gap: 5px; align-items: center;" },
        el("span", { style: `width: 8px; height: 8px; border-radius: 50%; background: ${RARITY_CSS[card.rarity]}; display: inline-block;` }),
        TYPE_LABELS[card.type],
        stats && el("span", { style: "margin-left: auto; font-weight: bold; color: #22262f;" }, stats),
      ),
      el("div", { style: "font-size: 11px; line-height: 1.25; overflow: hidden; flex: 1;" }, card.text),
    );
  }

  function renderDeck(): void {
    const total = totalCards(draft);
    count.textContent = `${total} / ${rules.DECK_SIZE} carte${dirty ? " · modifiche non salvate" : ""}`;
    list.replaceChildren(
      ...deckRows(draft).map(({ cardId, card, copies }) =>
        el(
          "div",
          {
            title: "Togli una copia",
            style: "display: flex; gap: 8px; align-items: center; background: #2b2f3a; border-radius: 6px; padding: 3px 8px; cursor: pointer;",
            onclick: () => edit(removeCard(draft, cardId)),
          },
          el("b", { style: "width: 18px; color: #9fd0ff;" }, card ? String(card.cost) : "?"),
          el("span", { style: "flex: 1;" }, card?.name ?? `${cardId} (non più disponibile)`),
          el("b", {}, `×${copies}`),
          el("span", { class: "ds-muted" }, "−"),
        ),
      ),
    );
    if (total === 0) list.append(el("div", { class: "ds-muted" }, "Clicca sulle carte a sinistra per aggiungerle."));
    const validation = validateDraft(draft);
    problems.textContent = validation.ok ? "" : validation.errors.slice(0, 2).map((e) => e.message).join(" · ");
    save.disabled = !validation.ok || !dirty;
    remove.hidden = !draft.id;
    remove.textContent = confirming === "delete" ? "Conferma" : "Elimina";
    close.textContent = confirming === "close" ? "Esci senza salvare" : "Chiudi";
  }

  search.addEventListener("input", () => {
    filter.text = search.value;
    renderGrid();
  });
  typeSelect.addEventListener("change", () => {
    filter.type = (typeSelect.value || null) as CardType | null;
    renderGrid();
  });
  name.addEventListener("input", () => {
    draft = { ...draft, name: name.value };
    dirty = true;
    touched = true;
    renderDeck();
  });

  save.addEventListener("click", async () => {
    save.disabled = true;
    setStatus("Salvataggio…");
    try {
      const saved = await saveDeck(draft);
      decks = [saved, ...decks.filter((d) => d.id !== saved.id)];
      changed = true;
      load(structuredClone(saved));
      setStatus("Mazzo salvato.");
    } catch (e) {
      setStatus(`Salvataggio non riuscito: ${(e as Error).message}`);
      renderDeck();
    }
  });

  remove.addEventListener("click", async () => {
    if (!draft.id) return;
    if (confirming !== "delete") {
      confirming = "delete";
      return renderDeck();
    }
    try {
      await deleteDeck(draft.id);
      decks = decks.filter((d) => d.id !== draft.id);
      changed = true;
      load(decks[0] ? structuredClone(decks[0]) : prebuiltDraft(heroId));
      setStatus("Mazzo eliminato.");
    } catch (e) {
      setStatus(`Eliminazione non riuscita: ${(e as Error).message}`);
    }
  });

  const dom = scene.add.dom(WIDTH / 2, HEIGHT / 2, root).setDepth(1000);
  close.addEventListener("click", () => {
    if (touched && confirming !== "close") {
      confirming = "close";
      return renderDeck();
    }
    dom.destroy();
    onClose(changed);
  });

  renderFilters();
  load(draft);
  setStatus("Caricamento dei tuoi mazzi…");
  listDecks()
    .then((all) => {
      decks = all.filter((d) => d.heroId === heroId);
      if (decks[0]) load(structuredClone(decks[0]));
      else renderTabs();
      setStatus(decks.length ? "" : "Nessun mazzo salvato: parti dal precostruito o da zero.");
    })
    .catch((e: unknown) => setStatus(`Mazzi non disponibili: ${(e as Error).message}`));
}

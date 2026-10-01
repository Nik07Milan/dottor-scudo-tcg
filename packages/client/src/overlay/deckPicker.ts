// Scelta del mazzo in lobby (T5.3): "Precostruito" o uno dei tuoi mazzi per l'eroe scelto.
// Compare solo da collegato; "Gestisci mazzi" apre il deck builder.

import type { Scene } from "phaser";
import { getAccount, onAccountChange, supabase } from "../account";
import { listDecks, type SavedDeck } from "../decks/repo";
import { el, ensureStyles } from "./dom";

export interface DeckPicker {
  /** Mazzo scelto, o null = precostruito. */
  selected(): SavedDeck | null;
  /** Da chiamare quando cambia l'eroe o dopo il deck builder. */
  refresh(): void;
}

export function mountDeckPicker(scene: Scene, x: number, y: number, heroId: () => string, manage: () => void): DeckPicker {
  let decks: SavedDeck[] = [];
  let chosen: string | null = null;
  const none: DeckPicker = { selected: () => null, refresh: () => {} };
  if (!supabase) return none;
  ensureStyles();

  const select = el("select", { style: "width: 260px;" });
  const root = el(
    "div",
    { class: "ds-ui ds-row" },
    el("span", { style: "font-weight: bold;" }, "Mazzo:"),
    select,
    el("button", { class: "ds-secondary", onclick: manage }, "Gestisci mazzi"),
  );
  const dom = scene.add.dom(x, y, root);

  const render = () => {
    const mine = decks.filter((d) => d.heroId === heroId());
    if (chosen && !mine.some((d) => d.id === chosen)) chosen = null;
    select.replaceChildren(
      el("option", { value: "" }, "Precostruito"),
      ...mine.map((d) => el("option", { value: d.id, selected: d.id === chosen }, d.name)),
    );
    dom.setVisible(getAccount() !== null);
  };

  const refresh = () => {
    if (!getAccount()) {
      decks = [];
      return render();
    }
    render();
    listDecks()
      .then((all) => {
        decks = all;
        render();
      })
      .catch(() => render());
  };

  select.addEventListener("change", () => (chosen = select.value || null));
  const stop = onAccountChange(refresh);
  scene.events.once("shutdown", stop);
  refresh();

  return {
    selected: () => decks.find((d) => d.id === chosen && d.heroId === heroId()) ?? null,
    refresh,
  };
}

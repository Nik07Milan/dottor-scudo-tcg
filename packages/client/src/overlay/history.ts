// "Le mie partite" (T5.3): overlay HTML con lo storico; "Rivedi" apre il replay nella plancia.

import type { Scene } from "phaser";
import { getAccount } from "../account";
import { formatDate, matchLine, type MatchLine } from "../history/model";
import { PAGE_SIZE, listMatches, loadMatch, nicknames } from "../history/repo";
import { ReplayMatch } from "../replay";
import { HEIGHT, WIDTH } from "../theme";
import { el, ensureStyles } from "./dom";
import { mountReplayControls } from "./replayControls";

const OUTCOME_CSS: Record<MatchLine["outcome"], string> = { Vittoria: "#7cf27a", Sconfitta: "#ff8a7a", Pareggio: "#f2c14e" };

export function openHistory(scene: Scene): void {
  const account = getAccount();
  if (!account) return;
  ensureStyles();
  const me = account.session.user.id;
  const lines: MatchLine[] = [];
  const names = new Map<string, string>();
  let page = 0;

  const list = el("div", { class: "ds-col", style: "flex: 1; overflow-y: auto; gap: 6px; padding-right: 6px;" });
  const status = el("div", { class: "ds-muted", style: "min-height: 18px;" });
  const more = el("button", { class: "ds-secondary", hidden: true }, "Altre partite");
  const close = el("button", { class: "ds-secondary" }, "Chiudi");
  const root = el(
    "div",
    {
      class: "ds-ui",
      style: `width: ${WIDTH}px; height: ${HEIGHT}px; background: #1b1f2a; padding: 18px 22px; display: flex; flex-direction: column; gap: 12px;`,
    },
    el(
      "div",
      { class: "ds-row", style: "justify-content: space-between;" },
      el("div", { style: "font-size: 24px; font-weight: bold; color: #d8b26a;" }, "Le mie partite"),
      close,
    ),
    list,
    el("div", { class: "ds-row" }, more, status),
  );
  const dom = scene.add.dom(WIDTH / 2, HEIGHT / 2, root).setDepth(1000);
  close.addEventListener("click", () => dom.destroy());

  const row = (line: MatchLine) => {
    const foe = line.foeUser ? (names.get(line.foeUser) ?? "giocatore") : "ospite";
    const watch = el("button", {}, "Rivedi");
    watch.addEventListener("click", () => void watchReplay(line, watch));
    return el(
      "div",
      { class: "ds-panel ds-row", style: "gap: 16px; padding: 8px 14px;" },
      el("div", { class: "ds-muted", style: "width: 130px;" }, formatDate(line.endedAt)),
      el("b", { style: `width: 95px; color: ${OUTCOME_CSS[line.outcome]};` }, line.outcome),
      el("div", { style: "flex: 1;" }, el("b", {}, line.myHero), " contro ", el("b", {}, line.foeHero), el("span", { class: "ds-muted" }, ` · ${foe}`)),
      el("div", { class: "ds-muted", style: "width: 200px;" }, `${line.reason} · turno ${line.turns}`),
      line.outdated ? el("span", { title: "Le carte sono cambiate dopo questa partita: il replay potrebbe non riuscire." }, "⚠") : el("span", {}),
      watch,
    );
  };

  const render = () => {
    list.replaceChildren(...lines.map(row));
    if (lines.length === 0) list.append(el("div", { class: "ds-muted" }, "Ancora nessuna partita online salvata. Le partite contro l'IA e il tutorial non vanno nello storico."));
  };

  const loadPage = async () => {
    status.textContent = "Caricamento…";
    more.hidden = true;
    try {
      const rows = await listMatches(page);
      const fresh = rows.map((r) => matchLine(r, me));
      const unknown = fresh.map((l) => l.foeUser).filter((id): id is string => !!id && !names.has(id));
      for (const [id, nick] of await nicknames(unknown)) names.set(id, nick);
      lines.push(...fresh);
      more.hidden = rows.length < PAGE_SIZE;
      page++;
      status.textContent = "";
      render();
    } catch (e) {
      status.textContent = `Storico non disponibile: ${(e as Error).message}`;
    }
  };
  more.addEventListener("click", () => void loadPage());

  const watchReplay = async (line: MatchLine, button: HTMLButtonElement) => {
    button.disabled = true;
    status.textContent = "Carico la partita…";
    try {
      const { setup, actions } = await loadMatch(line.id);
      const match = new ReplayMatch(setup, actions, line.viewer);
      const board = scene.scene.get("board");
      board.events.once("create", () => mountReplayControls(board, match, line.outdated));
      scene.scene.start("board", { connection: match });
    } catch (e) {
      button.disabled = false;
      status.textContent = line.outdated
        ? "Questa partita non si può più rigiocare: le carte sono cambiate dopo che è stata giocata."
        : `Replay non riuscito: ${(e as Error).message}`;
    }
  };

  render();
  void loadPage();
}

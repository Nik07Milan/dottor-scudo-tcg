// Controlli del replay (T5.3): pannello HTML sopra la plancia. La plancia non sa di essere in un replay.

import type { Scene } from "phaser";
import { BOARD_IDLE } from "../match";
import type { ReplayMatch } from "../replay";
import { el, ensureStyles } from "./dom";

/** Colonna destra della plancia, tra "Fine turno" e i caffettini: nel replay è libera. */
const X = 1171;
const Y = 462;

export function mountReplayControls(scene: Scene, match: ReplayMatch, outdated: boolean): void {
  ensureStyles();
  const button = (label: string, title: string, fn: () => void) =>
    el("button", { class: "ds-secondary", title, onclick: fn, style: "width: 32px; padding: 6px 0;" }, label);
  const playPause = el("button", { title: "Play / pausa", style: "width: 32px; padding: 6px 0;", onclick: () => (match.playing ? match.pause() : match.play()) });
  const speed = el("button", { class: "ds-secondary", title: "Velocità", style: "width: 32px; padding: 6px 0; font-size: 12px;" });
  speed.addEventListener("click", () => {
    match.speed = match.speed === 1 ? 2 : match.speed === 2 ? 4 : 1;
    render();
  });
  const progress = el("div", { class: "ds-muted", style: "text-align: center;" });
  const exit = el("button", { class: "ds-danger", style: "width: 100%;" }, "Esci dal replay");
  exit.addEventListener("click", () => void match.leave().finally(() => scene.scene.start("lobby")));

  const root = el(
    "div",
    { class: "ds-ui ds-panel ds-col", style: "width: 186px; gap: 6px; padding: 8px;" },
    el("b", { style: "color: #d8b26a; text-align: center;" }, "Replay"),
    el(
      "div",
      { class: "ds-row", style: "gap: 4px; justify-content: center;" },
      button("⏮", "Dall'inizio", () => match.restart()),
      button("◀", "Passo indietro", () => (match.pause(), match.prev())),
      playPause,
      button("▶", "Passo avanti", () => (match.pause(), match.next())),
      speed,
    ),
    progress,
    outdated && el("div", { class: "ds-error", style: "text-align: center;" }, "⚠ carte cambiate dopo la partita"),
    exit,
  );

  function render(): void {
    playPause.textContent = match.playing ? "⏸" : "⏵";
    speed.textContent = `×${match.speed}`;
    progress.textContent = `mossa ${match.step} / ${match.steps}`;
  }

  match.onChange = render;
  render();
  scene.add.dom(X, Y, root).setDepth(1000);

  // In riproduzione il passo successivo aspetta la fine delle animazioni della plancia.
  match.usePacing();
  const idle = () => match.boardIdle();
  scene.events.on(BOARD_IDLE, idle);
  // Gli ascoltatori della scena sopravvivono al riavvio: vanno tolti all'uscita.
  scene.events.once("shutdown", () => {
    scene.events.off(BOARD_IDLE, idle);
    void match.leave();
  });
}

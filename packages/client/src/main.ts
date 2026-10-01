// Avvio del client (M4): Phaser disegna tutto, dalla lobby alla plancia.
import { AUTO, Game, Scale } from "phaser";
import { BoardScene } from "./scenes/BoardScene";
import { LobbyScene } from "./scenes/LobbyScene";
import { COLORS, HEIGHT, WIDTH } from "./theme";

new Game({
  type: AUTO,
  parent: "game",
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: COLORS.background,
  scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
  // Elementi DOM per i campi di testo (codice invito).
  dom: { createContainer: true },
  scene: [LobbyScene, BoardScene],
});

// Lobby (T4.1): scelta dell'eroe, crea una stanza o entra con il codice invito. Tutto in Phaser;
// il campo del codice è un elemento DOM (this.add.dom).

import { HEROES, HEROES_BY_ID, greedyBot, randomBot, type Bot } from "@dottorscudo/engine";
import { ART_READY, croppedImage, heroPortrait, requestArt } from "../ui/art";
import { LocalMatch } from "../local";
import { TutorialMatch } from "../tutorial/tutorial";
import { Scene } from "phaser";
import type { ServerMessages } from "../../../server/src/protocol";
import { Connection } from "../net";
import { COLORS, FONT, HEIGHT, WIDTH } from "../theme";
import { button } from "../ui/cards";

export class LobbyScene extends Scene {
  private heroId = HEROES[0]!.id;
  private status!: Phaser.GameObjects.Text;
  private busy = false;
  private connection = new Connection();

  constructor() {
    super("lobby");
  }

  create(): void {
    this.connection = new Connection();
    this.busy = false;
    this.drawBackground();
    this.add.text(WIDTH / 2, 70, "DottorScudo TCG", { fontFamily: FONT, fontSize: "52px", color: COLORS.text, fontStyle: "bold" }).setOrigin(0.5);
    this.add.text(WIDTH / 2, 118, "il paladino degli impiegati contro la burocrazia aziendale", { fontFamily: FONT, fontSize: "18px", color: COLORS.muted }).setOrigin(0.5);

    this.drawHeroPicker();

    const create = button(this, WIDTH / 2 - 200, 560, "Crea partita", 220, 50);
    create.on("pointerdown", () => this.run(() => this.connection.create(this.heroId)));

    const input = this.add.dom(WIDTH / 2 + 120, 560, "input", "width: 150px; height: 40px; font-size: 22px; text-align: center; text-transform: uppercase; border-radius: 8px; border: 2px solid #d8b26a; background: #f4eedc;");
    const field = input.node as HTMLInputElement;
    field.placeholder = "CODICE";
    field.maxLength = 6;
    const join = button(this, WIDTH / 2 + 300, 560, "Entra", 140, 50);
    const doJoin = () => {
      const code = field.value.trim().toUpperCase();
      if (code.length !== 6) return this.setStatus("Il codice ha 6 caratteri.");
      this.run(() => this.connection.join(code, this.heroId));
    };
    join.on("pointerdown", doJoin);
    field.addEventListener("keydown", (e) => e.key === "Enter" && doJoin());

    // Da soli: contro l'IA (nel browser, senza server) o il tutorial guidato.
    const easy = button(this, WIDTH / 2 - 260, 625, "Contro l'IA · Facile", 230, 44, 0x9fd0ff);
    easy.on("pointerdown", () => this.playLocal(randomBot));
    const normal = button(this, WIDTH / 2, 625, "Contro l'IA · Normale", 230, 44, 0x9fd0ff);
    normal.on("pointerdown", () => this.playLocal(greedyBot));
    const tutorial = button(this, WIDTH / 2 + 260, 625, "Tutorial", 230, 44, 0x9fe09a);
    tutorial.on("pointerdown", () => this.playTutorial());

    this.status = this.add.text(WIDTH / 2, 690, "", { fontFamily: FONT, fontSize: "18px", color: COLORS.text, align: "center" }).setOrigin(0.5);

    // Ricaricando la pagina durante una partita si torna al tavolo.
    void this.connection.resume().then((ok) => ok && this.goToBoard());
  }

  private drawBackground(): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.background, 1).fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle(COLORS.desk, 1).fillRoundedRect(60, 150, WIDTH - 120, 520, 24);
    g.lineStyle(6, COLORS.deskEdge, 1).strokeRoundedRect(60, 150, WIDTH - 120, 520, 24);
  }

  private drawHeroPicker(): void {
    this.add.text(WIDTH / 2, 180, "Scegli il tuo eroe", { fontFamily: FONT, fontSize: "22px", color: COLORS.text }).setOrigin(0.5);
    const cards: Phaser.GameObjects.Container[] = [];
    HEROES.forEach((hero, i) => {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = WIDTH / 2 + (col - 2) * 205 + (row === 1 ? 102 : 0);
      const y = 270 + row * 150;
      const g = this.add.graphics();
      const draw = (selected: boolean) => {
        g.clear();
        g.fillStyle(selected ? 0xf4eedc : 0x3b4252, 1).fillRoundedRect(-92, -60, 184, 120, 14);
        g.lineStyle(selected ? 5 : 2, selected ? COLORS.highlight : 0xd8b26a, 1).strokeRoundedRect(-92, -60, 184, 120, 14);
      };
      const name = this.add.text(0, -34, hero.name, { fontFamily: FONT, fontSize: "18px", color: "#d8b26a", fontStyle: "bold" }).setOrigin(0.5);
      const faction = this.add.text(0, -12, hero.faction === "ufficio" ? "Ufficio" : "Soci & Nemici", { fontFamily: FONT, fontSize: "12px", color: COLORS.muted }).setOrigin(0.5);
      const power = this.add
        .text(0, 18, `${hero.heroPower.name}: ${hero.heroPower.text}`, { fontFamily: FONT, fontSize: "11px", color: "#8a8f99", align: "center", wordWrap: { width: 170 } })
        .setOrigin(0.5, 0.3);
      const c = this.add.container(x, y, [g, name, faction, power]).setSize(184, 120).setInteractive({ useHandCursor: true });
      c.setData("heroId", hero.id);
      c.setData("draw", draw);
      c.setData("labels", [name, faction]);
      c.on("pointerdown", () => {
        this.heroId = hero.id;
        for (const other of cards) (other.getData("draw") as (s: boolean) => void)(other.getData("heroId") === hero.id);
      });
      draw(hero.id === this.heroId);
      cards.push(c);
    });

    // Ritratti confermati: appena caricati compaiono nell'angolo della scheda.
    const placed = new Set<string>();
    const addPortraits = () => {
      for (const c of cards) {
        const id = c.getData("heroId") as string;
        if (placed.has(id)) continue;
        const key = requestArt(this, heroPortrait(id) ? HEROES_BY_ID.get(id)!.portrait : null);
        if (!key) continue;
        placed.add(id);
        c.add(croppedImage(this, key, -88, -56, 40, 40, 0.08));
        // Nome e fazione si spostano a destra del ritratto, così i nomi lunghi non ci finiscono sotto.
        for (const label of c.getData("labels") as Phaser.GameObjects.Text[]) label.setX(22);
      }
    };
    this.events.off(ART_READY);
    this.events.on(ART_READY, addPortraits);
    addPortraits();
  }

  private setStatus(text: string): void {
    this.status.setText(text);
  }

  private run(join: () => Promise<void>): void {
    if (this.busy) return;
    this.busy = true;
    this.setStatus("Connessione…");
    this.connection.on({
      waiting: (m: ServerMessages["waiting"]) => this.setStatus(`Codice partita: ${m.code}\nDallo al tuo avversario. In attesa…`),
      update: (u) => this.goToBoard(u),
      error: (e) => this.setStatus(e.message),
    });
    join().catch((e: unknown) => {
      this.busy = false;
      this.setStatus(`Impossibile entrare: ${e instanceof Error ? e.message : String(e)}`);
    });
  }

  /** Partita contro l'IA nel browser: niente server, si parte subito. */
  private playLocal(bot: Bot): void {
    if (this.busy) return;
    this.busy = true;
    this.scene.start("board", { connection: new LocalMatch({ heroId: this.heroId, bot }) });
  }

  private playTutorial(): void {
    if (this.busy) return;
    this.busy = true;
    this.scene.start("board", { connection: new TutorialMatch() });
  }

  /** `first`: l'update che ha fatto partire la partita (dopo una riconnessione arriva dalla coda della connessione). */
  private goToBoard(first?: ServerMessages["update"]): void {
    this.connection.on({});
    this.scene.start("board", { connection: this.connection, first });
  }
}

// Plancia di gioco (T4.3–T4.6). Phaser è solo presentazione e input (CLAUDE.md, principio 7):
// - lo stato arriva dal server come PlayerView e diventa un BoardModel (model.ts);
// - i gesti diventano Action tramite input.ts, che usa solo le mosse legali dell'engine;
// - gli eventi diventano animazioni in coda; finita la coda la plancia si ridisegna dalla vista.

import { CARDS, getLegalActions, type Action, type CharacterRef, type GameEvent, type PlayerId, type PlayerView } from "@dottorscudo/engine";
import { Geom, Scene } from "phaser";
import type { ServerMessages } from "../../../server/src/protocol";
import { playSound } from "../audio";
import { EventQueue } from "../eventQueue";
import { NONE, click, highlightsFor, type Click, type Highlights, type Selection } from "../input";
import { viewToModel, type BoardModel } from "../model";
import { ART_READY } from "../ui/art";
import { BOARD_IDLE, type MatchConnection } from "../match";
import { COLORS, DURATION, FONT, HEIGHT, WIDTH } from "../theme";
import { CARD_H, CARD_W, HERO_H, HERO_W, MINION_H, MINION_W, button, cardBack, cardView, glow, heroView, minionView } from "../ui/cards";

type Container = Phaser.GameObjects.Container;

/** Eventi che si animano in parallelo con quelli adiacenti dello stesso tipo di gruppo. */
const SIMULTANEOUS = new Set<GameEvent["type"]>(["damage", "heal", "shield_broken", "minion_died", "frozen", "stats_changed", "armor_gained", "keyword_gained", "keyword_lost"]);

/** Nomi delle carte per i banner (anche quelle non in mano). */
const CARD_NAMES = new Map(CARDS.map((c) => [c.id, c.name]));

const LAYOUT = {
  boardX: 655,
  foeHero: { x: 655, y: 78 },
  foeBoard: 228,
  myBoard: 400,
  myHero: { x: 655, y: 548 },
  /** Centro delle carte in mano: ne sporge la metà superiore, al passaggio del mouse si alzano. */
  hand: 712,
  /** Linea di metà campo: banner e messaggi. */
  center: 314,
  minionGap: 108,
  log: { x: 14, y: 64, w: 230, h: 640 },
};

const REASONS: Record<string, string> = {
  hero_defeated: "ferie a zero",
  concede: "resa",
  turn_limit: "limite di turni",
  resolution_limit: "catena infinita",
};

interface HitArea {
  rect: Phaser.Geom.Rectangle;
  click: Click;
  /** Area di una schermata in primo piano (mulligan, Scopri, fine partita). */
  modal: boolean;
}

export class BoardScene extends Scene {
  private connection!: MatchConnection;
  private view: PlayerView | null = null;
  private model: BoardModel | null = null;
  private legal: Action[] = [];
  private selection: Selection = NONE;
  private highlights: Highlights = highlightsFor([], NONE);
  private deadline: number | null = null;
  private queue: EventQueue | null = null;
  private pending: ServerMessages["update"] | null = null;
  private animating = false;
  private inFlight = false;
  private opponentAway = false;
  /** Suggerimento del tutorial per il passo corrente. */
  private hint: string | null = null;
  private artRedraw: Phaser.Time.TimerEvent | null = null;

  private layer!: Container;
  private overlay!: Container;
  private arrow!: Phaser.GameObjects.Graphics;
  private timerBar!: Phaser.GameObjects.Graphics;
  private timerText!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private minionObjs = new Map<number, Container>();
  private heroObjs = new Map<PlayerId, Container>();
  private seenMinions = new Set<number>();
  private hits: HitArea[] = [];
  /** Carta premuta in mano: diventa clic al rilascio o trascinamento se il puntatore si muove. */
  private press: { cardId: number; x: number; y: number; ghost: Container | null } | null = null;
  private arrowFrom: { x: number; y: number } | null = null;

  constructor() {
    super("board");
  }

  init(data: { connection: MatchConnection; first?: ServerMessages["update"] }): void {
    this.connection = data.connection;
    this.view = null;
    this.model = null;
    this.queue = null;
    this.pending = data.first ?? null;
    this.selection = NONE;
    this.animating = false;
    this.inFlight = false;
    this.seenMinions = new Set();
    this.artRedraw = null;
    this.hint = null;
  }

  create(): void {
    this.drawTable();
    this.layer = this.add.container(0, 0);
    this.overlay = this.add.container(0, 0).setDepth(50);
    this.arrow = this.add.graphics().setDepth(40);
    this.timerBar = this.add.graphics().setDepth(5);
    this.timerText = this.add.text(1180, 286, "", { fontFamily: FONT, fontSize: "14px", color: COLORS.text }).setOrigin(0.5).setDepth(5);
    this.toast = this.add.text(LAYOUT.boardX, LAYOUT.center, "", { fontFamily: FONT, fontSize: "20px", color: "#ffd27a", fontStyle: "bold", align: "center" }).setOrigin(0.5).setDepth(60);
    this.makeSparkTexture();

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      this.onPointerMove(p);
      this.drawArrow(p);
    });
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onPointerUp(p));
    this.input.keyboard?.on("keydown-ESC", () => this.onClick({ on: "cancel" }));
    this.input.mouse?.disableContextMenu();

    // Arte caricata: un solo ridisegno per i caricamenti ravvicinati; durante le animazioni non serve
    // (a fine coda la plancia si ridisegna comunque).
    // Gli eventi della scena sopravvivono al riavvio: si toglie l'ascoltatore della partita precedente.
    this.events.off(ART_READY);
    this.events.on(ART_READY, () => {
      if (this.artRedraw) return;
      this.artRedraw = this.time.delayedCall(60, () => {
        this.artRedraw = null;
        if (!this.animating) this.render();
      });
    });
    this.connection.on({
      update: (u) => this.onUpdate(u),
      error: (e) => {
        this.inFlight = false;
        this.showToast(e.message);
        this.refreshHighlights();
      },
      opponent: (m) => {
        this.opponentAway = !m.connected;
        this.showToast(m.connected ? "L'avversario è tornato" : "L'avversario si è disconnesso…");
      },
      joined: () => {},
      waiting: () => {},
    });
    if (this.pending) {
      const first = this.pending;
      this.pending = null;
      this.onUpdate(first);
    }
  }

  update(): void {
    this.drawTimer();
  }

  // ------------------------------------------------------------------------------------------
  // Stato in arrivo: eventi in coda → animazioni → ridisegno dalla vista
  // ------------------------------------------------------------------------------------------

  private onUpdate(u: ServerMessages["update"]): void {
    this.deadline = u.deadline;
    this.hint = u.hint ?? null;
    if (!this.queue) {
      const heroes = { p1: u.view.players.p1.hero.heroId, p2: u.view.players.p2.hero.heroId };
      this.queue = new EventQueue(heroes);
      // Primo stato (avvio o riconnessione): niente animazioni retroattive.
      this.queue.push(u.events);
      this.queue.clear();
      this.applyView(u.view);
      return;
    }
    if (u.actor === u.view.viewer) this.inFlight = false;
    this.queue.push(u.events);
    this.pending = u;
    if (!this.animating) void this.playQueue();
  }

  private async playQueue(): Promise<void> {
    this.animating = true;
    if (import.meta.env.DEV) ((window as unknown as { __DS__?: Record<string, unknown> }).__DS__ ??= {}).animating = true;
    this.arrow.clear();
    let e: GameEvent | undefined;
    while ((e = this.queue!.next())) {
      if (!SIMULTANEOUS.has(e.type)) {
        await this.animate(e);
        continue;
      }
      // Danni, cure, morti… dello stesso effetto: tutti insieme (GDD §1.5.4), si aspetta solo il gruppo.
      const group = [this.animate(e)];
      while (this.queue!.size > 0 && SIMULTANEOUS.has(this.queue!.peek()!.type)) group.push(this.animate(this.queue!.next()!));
      await Promise.all(group);
    }
    this.animating = false;
    const latest = this.pending;
    this.pending = null;
    if (latest) this.applyView(latest.view);
    this.events.emit(BOARD_IDLE);
  }

  private applyView(view: PlayerView): void {
    this.view = view;
    this.model = viewToModel(view, view.viewer);
    const legal = getLegalActions(view, view.viewer);
    // Nel tutorial la partita restringe le mosse a quella spiegata.
    this.legal = this.connection.filterLegal ? this.connection.filterLegal(legal) : legal;
    this.selection = NONE;
    this.render();
    // Solo in sviluppo: il modello disegnato, per i test end-to-end.
    if (import.meta.env.DEV) ((window as unknown as { __DS__?: Record<string, unknown> }).__DS__ ??= {}).model = this.model;
  }

  // ------------------------------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------------------------------

  private onClick(c: Click): void {
    if (!this.model || this.animating || this.inFlight) return;
    const out = click(this.legal, this.selection, c);
    this.selection = out.selection;
    this.highlights = out.highlights;
    if (out.send) {
      const { player: _player, ...action } = out.send;
      this.inFlight = true;
      this.connection.send(action);
      playSound(this, "play");
    }
    this.render();
  }

  private refreshHighlights(): void {
    this.highlights = highlightsFor(this.legal, this.selection);
    this.render();
  }

  /**
   * Registra un'area cliccabile. I clic non passano dagli oggetti ma da un solo gestore globale
   * (onPointerDown) che guarda le aree dell'ultima disegnata: così un clic arrivato mentre la plancia
   * si ridisegna per un update non finisce su un oggetto appena distrutto.
   */
  private clickable(obj: Container, c: Click, modal = false): void {
    obj.setInteractive({ useHandCursor: true }); // cursore e hover
    const b = obj.getBounds();
    this.hits.push({ rect: new Geom.Rectangle(b.x, b.y, b.width, b.height), click: c, modal });
  }

  private hitAt(x: number, y: number): HitArea | undefined {
    const hasModal = this.hits.some((h) => h.modal);
    // L'ultima area registrata è quella disegnata sopra.
    return [...this.hits].reverse().find((h) => (!hasModal || h.modal) && h.rect.contains(x, y));
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (p.rightButtonDown()) return this.onClick({ on: "cancel" });
    const hit = this.hitAt(p.x, p.y);
    // Una carta in mano può diventare un trascinamento: si decide al movimento o al rilascio.
    if (hit?.click.on === "hand") {
      this.press = { cardId: hit.click.instanceId, x: p.x, y: p.y, ghost: null };
      return;
    }
    if (hit) this.onClick(hit.click);
    else if (this.selection.kind !== "none") this.onClick({ on: "cancel" });
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    const press = this.press;
    if (!press || !p.isDown) return;
    if (!press.ghost && Math.hypot(p.x - press.x, p.y - press.y) > 10) {
      const card = this.model?.me.hand.find((c) => c.instanceId === press.cardId);
      if (!card || !card.playable) return;
      press.ghost = cardView(this, p.x, p.y, card, 0.9).setDepth(48).setAlpha(0.9);
    }
    press.ghost?.setPosition(p.x, p.y);
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    const press = this.press;
    this.press = null;
    if (!press) return;
    if (press.ghost) {
      press.ghost.destroy();
      this.onDrop(press.cardId, p.x, p.y);
    } else {
      this.onClick({ on: "hand", instanceId: press.cardId });
    }
  }

  /** Dove sta il giocatore che seleziona: origine della freccia di mira. */
  private selectionOrigin(): { x: number; y: number } | null {
    const s = this.selection;
    if (s.kind === "attacker") {
      const obj = s.attacker.kind === "minion" ? this.minionObjs.get(s.attacker.instanceId) : this.heroObjs.get(s.attacker.player);
      return obj ? { x: obj.x, y: obj.y } : null;
    }
    if (s.kind === "power") return { x: LAYOUT.myHero.x + 150, y: LAYOUT.myHero.y };
    if (s.kind === "card" && (this.highlights.minions.size > 0 || this.highlights.heroes.size > 0)) return { x: LAYOUT.boardX, y: LAYOUT.hand - 40 };
    return null;
  }

  private drawArrow(p: Phaser.Input.Pointer): void {
    this.arrow.clear();
    const from = this.arrowFrom;
    if (!from || this.animating) return;
    this.arrow.lineStyle(6, COLORS.target, 0.85).lineBetween(from.x, from.y, p.x, p.y);
    this.arrow.fillStyle(COLORS.target, 1).fillCircle(p.x, p.y, 10);
  }

  // ------------------------------------------------------------------------------------------
  // Disegno
  // ------------------------------------------------------------------------------------------

  private drawTable(): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.background, 1).fillRect(0, 0, WIDTH, HEIGHT);
    // Scrivania di legno con venature e due "fogli" per i campi.
    g.fillStyle(COLORS.desk, 1).fillRoundedRect(258, 12, 800, 696, 26);
    g.lineStyle(6, COLORS.deskEdge, 1).strokeRoundedRect(258, 12, 800, 696, 26);
    g.lineStyle(1, COLORS.deskEdge, 0.35);
    for (let y = 40; y < 700; y += 34) g.lineBetween(270, y, 1046, y + 6);
    g.fillStyle(COLORS.paper, 0.13).fillRoundedRect(282, LAYOUT.foeBoard - 72, 752, 144, 18);
    g.fillStyle(COLORS.paper, 0.13).fillRoundedRect(282, LAYOUT.myBoard - 72, 752, 144, 18);
    g.lineStyle(2, COLORS.paper, 0.25).lineBetween(300, LAYOUT.center, 1016, LAYOUT.center);
    // Pannelli laterali.
    g.fillStyle(0x1f232d, 1).fillRoundedRect(LAYOUT.log.x, LAYOUT.log.y, LAYOUT.log.w, LAYOUT.log.h, 14);
    g.fillStyle(0x1f232d, 1).fillRoundedRect(1074, 12, 194, 696, 14);
    this.add.text(LAYOUT.log.x + 12, 28, "Registro", { fontFamily: FONT, fontSize: "18px", color: COLORS.text, fontStyle: "bold" });
  }

  private makeSparkTexture(): void {
    if (this.textures.exists("spark")) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillCircle(6, 6, 6);
    g.generateTexture("spark", 12, 12);
    g.destroy();
  }

  private render(): void {
    this.layer.removeAll(true);
    this.overlay.removeAll(true);
    this.minionObjs.clear();
    this.heroObjs.clear();
    this.hits = [];
    const m = this.model;
    if (!m) return;
    if (this.selection.kind === "none") this.highlights = highlightsFor(this.legal, NONE);
    const h = this.highlights;

    this.drawSide(m, "foe");
    this.drawSide(m, "me");
    this.drawHand(m, h);
    this.drawSlots(h);
    this.drawRightPanel(m, h);
    this.drawLog();

    if (m.phase === "mulligan") this.drawMulligan(m);
    else if (m.choice) this.drawChoice(m);
    if (m.result) this.drawGameOver(m);
    // Il fumetto del tutorial va sopra tutto, anche sopra le schermate in primo piano.
    this.drawHint();

    this.arrowFrom = this.selectionOrigin();
    if (!this.arrowFrom) this.arrow.clear();
    if (import.meta.env.DEV) {
      const debug = ((window as unknown as { __DS__?: Record<string, unknown> }).__DS__ ??= {});
      debug.selection = this.selection;
      debug.inFlight = this.inFlight;
      debug.hint = this.hint;
      debug.animating = this.animating;
      debug.highlights = { minions: [...h.minions], heroes: [...h.heroes], slots: h.slots, hand: [...h.hand] };
    }
  }

  private drawSide(m: BoardModel, who: "me" | "foe"): void {
    const side = m[who];
    const h = this.highlights;
    const y = who === "me" ? LAYOUT.myBoard : LAYOUT.foeBoard;
    const n = side.board.length;
    side.board.forEach((minion, i) => {
      const x = LAYOUT.boardX + (i - (n - 1) / 2) * LAYOUT.minionGap;
      const obj = minionView(this, x, y, minion);
      const selected = this.selection.kind === "attacker" && this.selection.attacker.kind === "minion" && this.selection.attacker.instanceId === minion.instanceId;
      if (selected) obj.addAt(glow(this, MINION_W, MINION_H, COLORS.highlight, 16), 0);
      else if (h.minions.has(minion.instanceId)) obj.addAt(glow(this, MINION_W, MINION_H, this.selection.kind === "none" ? COLORS.highlight : COLORS.target, 16), 0);
      this.layer.add(obj);
      this.minionObjs.set(minion.instanceId, obj);
      this.clickable(obj, { on: "minion", instanceId: minion.instanceId });
      if (!this.seenMinions.has(minion.instanceId)) {
        this.seenMinions.add(minion.instanceId);
        obj.setScale(0.3).setAlpha(0);
        this.tweens.add({ targets: obj, scale: 1, alpha: 1, duration: DURATION.step, ease: "Back.Out" });
      }
    });

    const pos = who === "me" ? LAYOUT.myHero : LAYOUT.foeHero;
    const hero = heroView(this, pos.x, pos.y, side.hero);
    if (h.heroes.has(side.player)) hero.addAt(glow(this, HERO_W, HERO_H, this.selection.kind === "none" ? COLORS.highlight : COLORS.target, 20), 0);
    this.layer.add(hero);
    this.heroObjs.set(side.player, hero);
    this.clickable(hero, { on: "hero", player: side.player });

    // Potere eroe accanto al ritratto.
    const power = side.hero.power;
    const px = pos.x + 150;
    const g = this.add.graphics();
    g.fillStyle(power.used ? 0x444a57 : 0x6a4fb3, 1).fillCircle(0, 0, 34);
    g.lineStyle(3, who === "me" && h.power ? COLORS.highlight : 0xd8b26a, 1).strokeCircle(0, 0, 34);
    const label = this.add
      .text(0, -2, power.name, { fontFamily: FONT, fontSize: "10px", color: COLORS.text, align: "center", wordWrap: { width: 60 } })
      .setOrigin(0.5);
    const cost = this.add.text(0, 24, String(power.cost), { fontFamily: FONT, fontSize: "13px", color: "#9fd0ff", fontStyle: "bold" }).setOrigin(0.5);
    const powerObj = this.add.container(px, pos.y, [g, label, cost]).setSize(68, 68);
    this.layer.add(powerObj);
    if (who === "me") {
      if (power.options.length > 0 && h.power && this.selection.kind === "none") {
        // Alza lo scudo: due opzioni, due bottoni.
        power.options.forEach((opt, i) => {
          const b = button(this, px + 120, pos.y - 24 + i * 48, opt, 150, 40, 0xb7a3f0);
          this.layer.add(b);
          this.clickable(b, { on: "power", option: i });
        });
      } else {
        this.clickable(powerObj, { on: "power" });
      }
    }

    // Mano avversaria (dorsi), mazzo e caffettini.
    if (who === "foe") {
      for (let i = 0; i < side.handCount; i++) this.layer.add(cardBack(this, 900 + i * 14, 40, 0.32));
      this.layer.add(this.add.text(900, 80, `${side.handCount} in mano · ${side.deckCount} nel mazzo`, { fontFamily: FONT, fontSize: "12px", color: COLORS.muted }));
      this.layer.add(this.add.text(300, 30, `Caffettini ${side.mana.available}/${side.mana.max}`, { fontFamily: FONT, fontSize: "14px", color: "#9fd0ff" }));
    }
    if (side.task) {
      const ty = who === "me" ? LAYOUT.myHero.y - 70 : LAYOUT.foeHero.y + 70;
      this.layer.add(
        this.add.text(pos.x - 230, ty, `Task: ${side.task.name} ${side.task.progress}/${side.task.goal}`, { fontFamily: FONT, fontSize: "13px", color: "#ffd27a" }).setOrigin(0, 0.5),
      );
    }
  }

  private drawHand(m: BoardModel, h: Highlights): void {
    if (m.phase === "mulligan") return;
    const cards = m.me.hand;
    const n = cards.length;
    const gap = Math.min(96, 640 / Math.max(1, n));
    cards.forEach((card, i) => {
      const x = LAYOUT.boardX + (i - (n - 1) / 2) * gap;
      const obj = cardView(this, x, LAYOUT.hand, card, 0.82);
      const selected = this.selection.kind === "card" && this.selection.card === card.instanceId;
      if (selected) obj.y -= 40;
      if (h.hand.has(card.instanceId)) obj.addAt(glow(this, CARD_W, CARD_H, COLORS.highlight), 0);
      obj.on("pointerover", () => !selected && this.tweens.add({ targets: obj, y: LAYOUT.hand - 70, scale: 1, duration: 120 }));
      obj.on("pointerout", () => !selected && this.tweens.add({ targets: obj, y: LAYOUT.hand, scale: 0.82, duration: 120 }));
      this.layer.add(obj);
      // Clic e trascinamento sono gestiti dai gestori globali del puntatore (onPointerDown/Move/Up).
      this.clickable(obj, { on: "hand", instanceId: card.instanceId });
    });
    this.layer.add(this.add.text(300, 690, `${m.me.deckCount} nel mazzo`, { fontFamily: FONT, fontSize: "12px", color: COLORS.muted }));
  }

  /**
   * Rilascio di una carta trascinata. Prima si seleziona la carta (la plancia si ridisegna con posti e
   * bersagli), poi si applica il clic nel punto di rilascio. Rilasciata sulla mano: annulla.
   */
  private onDrop(cardId: number, x: number, y: number): void {
    if (y > LAYOUT.hand - 60) return this.onClick({ on: "cancel" });
    this.onClick({ on: "hand", instanceId: cardId });
    if (this.selection.kind !== "card") return; // giocata subito (Pratica senza bersaglio) o non giocabile
    const hit = this.hitAt(x, y);
    if (hit && hit.click.on !== "hand") return this.onClick(hit.click);
    if (this.highlights.slots.length > 0 && Math.abs(y - LAYOUT.myBoard) < 90) {
      // Sulla scrivania ma fuori dai posti segnati: il più vicino.
      const n = this.model!.me.board.length;
      const nearest = this.highlights.slots.reduce((best, s) =>
        Math.abs(LAYOUT.boardX + (s - n / 2) * LAYOUT.minionGap - x) < Math.abs(LAYOUT.boardX + (best - n / 2) * LAYOUT.minionGap - x) ? s : best,
      );
      return this.onClick({ on: "slot", position: nearest });
    }
    this.onClick({ on: "cancel" });
  }

  private drawSlots(h: Highlights): void {
    if (h.slots.length === 0 || !this.model) return;
    const n = this.model.me.board.length;
    for (const slot of h.slots) {
      // Il posto i sta a sinistra del servitore i (0 = tutto a sinistra, n = tutto a destra).
      const x = LAYOUT.boardX + (slot - n / 2) * LAYOUT.minionGap;
      const g = this.add.graphics();
      g.fillStyle(COLORS.highlight, 0.25).fillRoundedRect(-22, -MINION_H / 2, 44, MINION_H, 12);
      g.lineStyle(3, COLORS.highlight, 0.9).strokeRoundedRect(-22, -MINION_H / 2, 44, MINION_H, 12);
      const c = this.add.container(x, LAYOUT.myBoard, [g]).setSize(44, MINION_H).setDepth(10);
      this.layer.add(c);
      this.clickable(c, { on: "slot", position: slot });
    }
  }

  private drawRightPanel(m: BoardModel, h: Highlights): void {
    const myTurn = m.myTurn;
    const turnLabel = m.phase === "mulligan" ? "Mulligan" : myTurn ? "Il tuo turno" : "Turno avversario";
    this.layer.add(this.add.text(1171, 60, `Turno ${m.turn}`, { fontFamily: FONT, fontSize: "16px", color: COLORS.muted }).setOrigin(0.5));
    this.layer.add(this.add.text(1171, 90, turnLabel, { fontFamily: FONT, fontSize: "20px", color: myTurn ? "#9fe09a" : COLORS.text, fontStyle: "bold" }).setOrigin(0.5));
    if (this.opponentAway) this.layer.add(this.add.text(1171, 120, "avversario disconnesso", { fontFamily: FONT, fontSize: "12px", color: "#ff9a8a" }).setOrigin(0.5));

    const end = button(this, 1171, 360, "Fine turno", 160, 52, h.endTurn ? 0x9fe09a : 0x6b7080);
    this.layer.add(end);
    if (h.endTurn) this.clickable(end, { on: "end_turn" });

    // Caffettini come tazzine.
    this.layer.add(this.add.text(1171, 560, `Caffettini ${m.me.mana.available}/${m.me.mana.max}`, { fontFamily: FONT, fontSize: "16px", color: "#9fd0ff", fontStyle: "bold" }).setOrigin(0.5));
    const g = this.add.graphics();
    for (let i = 0; i < 10; i++) {
      const x = 1100 + (i % 5) * 36;
      const y = 600 + Math.floor(i / 5) * 40;
      const color = i < m.me.mana.available ? COLORS.mana : i < m.me.mana.max ? 0x2a3b55 : 0x252a35;
      g.fillStyle(color, 1).fillRoundedRect(x - 12, y - 12, 24, 22, 5);
      g.lineStyle(2, 0xd8b26a, i < m.me.mana.max ? 0.9 : 0.25).strokeCircle(x + 14, y - 1, 6);
    }
    this.layer.add(g);
  }

  private drawLog(): void {
    const lines = this.queue?.log.slice(-26) ?? [];
    const t = this.add.text(LAYOUT.log.x + 12, LAYOUT.log.y + 20, lines.join("\n"), {
      fontFamily: FONT,
      fontSize: "11px",
      color: COLORS.muted,
      wordWrap: { width: LAYOUT.log.w - 24 },
      lineSpacing: 2,
    });
    // Mostra le righe più recenti: se il testo è troppo lungo, si taglia in alto.
    const overflow = t.height - (LAYOUT.log.h - 30);
    if (overflow > 0) t.setCrop(0, overflow, LAYOUT.log.w, LAYOUT.log.h).setY(t.y - overflow);
    this.layer.add(t);
  }

  /** Fumetto del tutorial, sopra la plancia (anche sopra mulligan e fine partita). */
  private drawHint(): void {
    if (!this.hint) return;
    const w = 560;
    const g = this.add.graphics().setDepth(70);
    g.fillStyle(0xfff6d8, 0.97).fillRoundedRect(-w / 2, -40, w, 80, 14);
    g.lineStyle(3, 0xd8b26a, 1).strokeRoundedRect(-w / 2, -40, w, 80, 14);
    const t = this.add
      .text(0, 0, this.hint, { fontFamily: FONT, fontSize: "16px", color: COLORS.textDark, align: "center", wordWrap: { width: w - 30 } })
      .setOrigin(0.5);
    const bubble = this.add.container(LAYOUT.boardX, LAYOUT.center, [g, t]).setDepth(70);
    // Il fumetto non deve coprire mosse: si sposta in alto se c'è una schermata in primo piano.
    if (this.model?.phase === "mulligan" || this.model?.choice || this.model?.result) bubble.setY(70);
    this.overlay.add(bubble);
  }

  private drawTimer(): void {
    this.timerBar.clear();
    if (!this.deadline || !this.model || this.model.result) {
      this.timerText.setText("");
      return;
    }
    const total = (this.model.phase === "mulligan" ? 45 : 75) * 1000;
    const left = Math.max(0, this.deadline - Date.now());
    const f = left / total;
    this.timerBar.fillStyle(0x2a2f3b, 1).fillRoundedRect(1094, 300, 154, 12, 6);
    this.timerBar.fillStyle(f < 0.2 ? COLORS.danger : COLORS.attack, 1).fillRoundedRect(1094, 300, 154 * f, 12, 6);
    this.timerText.setText(`${Math.ceil(left / 1000)} s`);
  }

  /** Sfondo di una schermata in primo piano: da qui in poi contano solo le aree modali. */
  private dim(): void {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.6).fillRect(0, 0, WIDTH, HEIGHT);
    this.overlay.add(g);
    this.hits.push({ rect: new Geom.Rectangle(0, 0, WIDTH, HEIGHT), click: { on: "cancel" }, modal: true });
  }

  private drawMulligan(m: BoardModel): void {
    this.dim();
    if (m.me.mulliganDone) {
      this.overlay.add(this.add.text(WIDTH / 2, HEIGHT / 2, "In attesa del mulligan dell'avversario…", { fontFamily: FONT, fontSize: "26px", color: COLORS.text }).setOrigin(0.5));
      return;
    }
    this.overlay.add(
      this.add.text(WIDTH / 2, 150, "Mulligan: scegli le carte da cambiare", { fontFamily: FONT, fontSize: "28px", color: COLORS.text, fontStyle: "bold" }).setOrigin(0.5),
    );
    const replace = this.selection.kind === "mulligan" ? this.selection.replace : [];
    const n = m.me.hand.length;
    m.me.hand.forEach((card, i) => {
      const x = WIDTH / 2 + (i - (n - 1) / 2) * 170;
      const obj = cardView(this, x, 360, card, 1.15);
      if (replace.includes(card.instanceId)) {
        obj.setAlpha(0.45);
        obj.add(this.add.text(0, 0, "CAMBIA", { fontFamily: FONT, fontSize: "24px", color: "#ff6b5a", fontStyle: "bold" }).setOrigin(0.5).setAngle(-18));
      }
      this.overlay.add(obj);
      this.clickable(obj, { on: "mulligan_toggle", instanceId: card.instanceId }, true);
    });
    const ok = button(this, WIDTH / 2, 560, replace.length ? `Cambia ${replace.length} e inizia` : "Tieni la mano", 240, 54, 0x9fe09a);
    this.overlay.add(ok);
    this.clickable(ok, { on: "mulligan_confirm" }, true);
  }

  private drawChoice(m: BoardModel): void {
    this.dim();
    this.overlay.add(this.add.text(WIDTH / 2, 160, "Scopri: scegli una carta", { fontFamily: FONT, fontSize: "28px", color: COLORS.text, fontStyle: "bold" }).setOrigin(0.5));
    const options = m.choice!;
    options.forEach((opt, i) => {
      const x = WIDTH / 2 + (i - (options.length - 1) / 2) * 200;
      const obj = cardView(this, x, 370, { ...opt, instanceId: -1, baseCost: opt.cost, keywords: [], rarity: "common", faction: "ufficio", playable: true }, 1.2);
      obj.addAt(glow(this, CARD_W, CARD_H, COLORS.highlight), 0);
      this.overlay.add(obj);
      this.clickable(obj, { on: "choose", index: i }, true);
    });
  }

  private drawGameOver(m: BoardModel): void {
    this.dim();
    const r = m.result!;
    const title = r.outcome === "win" ? "Hai vinto!" : r.outcome === "loss" ? "Hai perso" : "Pareggio";
    this.overlay.add(
      this.add.text(WIDTH / 2, 280, title, { fontFamily: FONT, fontSize: "64px", color: r.outcome === "win" ? "#9fe09a" : COLORS.text, fontStyle: "bold" }).setOrigin(0.5),
    );
    this.overlay.add(this.add.text(WIDTH / 2, 350, REASONS[r.reason] ?? r.reason, { fontFamily: FONT, fontSize: "22px", color: COLORS.muted }).setOrigin(0.5));
    const back = button(this, WIDTH / 2, 450, "Torna alla lobby", 240, 54);
    back.on("pointerdown", () => {
      void this.connection.leave().finally(() => this.scene.start("lobby"));
    });
    this.overlay.add(back);
    playSound(this, r.outcome === "win" ? "win" : "lose");
  }

  private showToast(text: string): void {
    this.toast.setText(text).setAlpha(1);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1800, duration: 600 });
  }

  // ------------------------------------------------------------------------------------------
  // Animazioni guidate dagli eventi (T4.5). Ogni animazione è breve; la vista finale vince sempre.
  // ------------------------------------------------------------------------------------------

  private objOf(ref: CharacterRef): Container | undefined {
    return ref.kind === "minion" ? this.minionObjs.get(ref.instanceId) : this.heroObjs.get(ref.player);
  }

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => this.tweens.add({ ...config, onComplete: () => resolve() }));
  }

  private floatText(x: number, y: number, text: string, color: string): Promise<void> {
    const t = this.add.text(x, y, text, { fontFamily: FONT, fontSize: "30px", color, fontStyle: "bold" }).setOrigin(0.5).setStroke("#000000", 5).setDepth(45);
    return this.tween({ targets: t, y: y - 40, alpha: 0, duration: DURATION.step * 2, onComplete: () => t.destroy() });
  }

  private burst(x: number, y: number, tint: number): void {
    const emitter = this.add.particles(x, y, "spark", { speed: { min: 60, max: 220 }, lifespan: 420, scale: { start: 0.9, end: 0 }, tint, emitting: false });
    emitter.setDepth(44);
    emitter.explode(16);
    this.time.delayedCall(600, () => emitter.destroy());
  }

  private banner(text: string): Promise<void> {
    const t = this.add.text(LAYOUT.boardX, LAYOUT.center, text, { fontFamily: FONT, fontSize: "34px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5).setStroke("#000000", 6).setDepth(46).setAlpha(0);
    return this.tween({ targets: t, alpha: 1, duration: 160, yoyo: true, hold: DURATION.banner / 2, onComplete: () => t.destroy() });
  }

  private async animate(e: GameEvent): Promise<void> {
    const me = this.view?.viewer;
    switch (e.type) {
      case "turn_started":
        playSound(this, "turn");
        return this.banner(e.player === me ? "Il tuo turno" : "Turno dell'avversario");
      case "card_played":
        if (e.player !== me) return this.banner(`L'avversario gioca ${this.cardName(e.cardId)}`);
        return;
      case "attack": {
        const a = this.objOf(e.attacker);
        const d = this.objOf(e.defender);
        if (!a || !d) return;
        playSound(this, "attack");
        const { x, y } = a;
        await this.tween({ targets: a, x: x + (d.x - x) * 0.7, y: y + (d.y - y) * 0.7, duration: DURATION.step * 0.6, ease: "Quad.In" });
        await this.tween({ targets: a, x, y, duration: DURATION.step * 0.6, ease: "Quad.Out" });
        return;
      }
      case "damage": {
        const o = this.objOf(e.target);
        if (!o) return;
        playSound(this, "damage");
        this.burst(o.x, o.y, COLORS.danger);
        this.cameras.main.shake(80, 0.003);
        return this.floatText(o.x, o.y - 20, `-${e.amount}`, "#ff6b5a");
      }
      case "heal": {
        const o = this.objOf(e.target);
        if (!o) return;
        return this.floatText(o.x, o.y - 20, `+${e.amount}`, "#7cf27a");
      }
      case "armor_gained": {
        const o = this.heroObjs.get(e.player);
        if (!o) return;
        return this.floatText(o.x, o.y - 20, `+${e.amount} armatura`, "#c8d0dc");
      }
      case "shield_broken": {
        const o = this.objOf(e.target);
        if (!o) return;
        this.burst(o.x, o.y, COLORS.shield);
        return this.floatText(o.x, o.y - 20, "Scudo!", "#ffe27a");
      }
      case "frozen": {
        const o = this.minionObjs.get(e.instanceId);
        if (!o || e.turns === 0) return;
        this.burst(o.x, o.y, COLORS.frozen);
        return this.floatText(o.x, o.y - 20, "In riunione", "#8fd3ff");
      }
      case "minion_died": {
        const o = this.minionObjs.get(e.instanceId);
        if (!o) return;
        playSound(this, "death");
        this.burst(o.x, o.y, 0x9a9a9a);
        return this.tween({ targets: o, alpha: 0, scale: 0.6, angle: 8, duration: DURATION.step });
      }
      case "task_completed":
        return this.banner(`Task completata: ${this.cardName(e.cardId)}!`);
      case "fatigue":
        return this.banner(e.player === me ? `Burnout! ${e.damage} danni` : `Burnout avversario: ${e.damage}`);
      default:
        return;
    }
  }

  private cardName(cardId: string): string {
    return this.model?.me.hand.find((c) => c.cardId === cardId)?.name ?? CARD_NAMES.get(cardId) ?? cardId;
  }
}

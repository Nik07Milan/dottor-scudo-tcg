// Partita contro l'IA nel browser. Eccezione dichiarata al principio 4 di CLAUDE.md: qui l'autorità è il
// client, perché contro un bot non c'è nessuno da imbrogliare; queste partite non vanno nello storico né
// nella classifica. Le regole restano tutte dell'engine: stessi update del server, stesse viste filtrate.

import {
  HEROES,
  IllegalActionError,
  applyAction,
  createGame,
  deckCards,
  getEventsView,
  getLegalActions,
  getPlayerView,
  type Action,
  type Bot,
  type GameEvent,
  type GameState,
  type PlayerId,
} from "@dottorscudo/engine";
import type { ClientAction, ServerMessages } from "../../server/src/protocol";
import type { MatchConnection, MatchHandlers } from "./match";

export interface LocalOptions {
  heroId: string;
  bot: Bot;
  /** Eroe del bot; se manca, uno a caso diverso dal tuo. */
  botHeroId?: string;
  seed?: number;
  /** Pausa tra i passi del bot (ms), perché le sue mosse si vedano. */
  delayMs?: number;
  /** Per i test: sostituisce setTimeout. */
  schedule?: (ms: number, fn: () => void) => () => void;
}

const HUMAN: PlayerId = "p1";
const BOT: PlayerId = "p2";

function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]!;
}

const defaultSchedule = (ms: number, fn: () => void) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export class LocalMatch implements MatchConnection {
  protected state: GameState;
  private handlers: MatchHandlers = {};
  private readonly backlog: { type: keyof ServerMessages; payload: unknown }[] = [];
  private readonly schedule: NonNullable<LocalOptions["schedule"]>;
  private readonly delay: number;
  private readonly bot: Bot;
  private botRng: number;
  private cancelBot: (() => void) | null = null;
  private left = false;

  constructor(options: LocalOptions, initial?: { state: GameState; events: GameEvent[] }) {
    this.bot = options.bot;
    this.schedule = options.schedule ?? defaultSchedule;
    this.delay = options.delayMs ?? 700;
    const seed = options.seed ?? randomSeed();
    this.botRng = (seed * 2654435761) >>> 0;

    const others = HEROES.filter((h) => h.id !== options.heroId);
    const botHero = options.botHeroId ?? others[seed % others.length]!.id;
    const start =
      initial ??
      createGame({
        seed,
        players: [
          { heroId: options.heroId, deck: deckCards(options.heroId) },
          { heroId: botHero, deck: deckCards(botHero) },
        ],
      });
    this.state = start.state;
    this.emit("joined", { player: HUMAN, code: "IA" });
    this.emitUpdate(start.events, null);
    this.scheduleBot();
  }

  on(handlers: MatchHandlers): void {
    this.handlers = handlers;
    for (const { type, payload } of this.backlog.splice(0)) this.emit(type, payload as never);
  }

  send(raw: ClientAction): void {
    if (this.left) return;
    // Come il server: il giocatore lo decide la partita, non il messaggio.
    const action = { ...raw, player: HUMAN } as Action;
    if (!this.accepts(action)) return;
    try {
      this.apply(action);
    } catch (e) {
      if (!(e instanceof IllegalActionError)) throw e;
      this.emit("error", { code: e.code, message: e.message });
    }
  }

  async leave(): Promise<void> {
    this.left = true;
    this.cancelBot?.();
    this.cancelBot = null;
  }

  /** Il tutorial lo ridefinisce per accettare solo la mossa attesa. */
  protected accepts(_action: Action): boolean {
    return true;
  }

  /** Il tutorial lo ridefinisce per mostrare il suggerimento del passo. */
  protected hint(): string | undefined {
    return undefined;
  }

  protected apply(action: Action): void {
    const { state, events } = applyAction(this.state, action);
    this.state = state;
    this.afterApply(action);
    this.emitUpdate(events, action.player);
    this.scheduleBot();
  }

  /** Punto di aggancio per il tutorial (preparare il passo successivo). */
  protected afterApply(_action: Action): void {}

  protected emitUpdate(events: GameEvent[], actor: PlayerId | null): void {
    const hint = this.hint();
    this.emit("update", {
      view: getPlayerView(this.state, HUMAN),
      events: getEventsView(events, HUMAN),
      deadline: null,
      actor,
      ...(hint ? { hint } : {}),
    });
  }

  /** Il bot deve agire? Mulligan (se non fatto), sua scelta di Scopri, suo turno. */
  protected botMustAct(): boolean {
    const s = this.state;
    if (s.phase === "ended") return false;
    if (s.phase === "mulligan") return !s.players[BOT].mulliganDone;
    if (s.pendingChoice) return s.pendingChoice.player === BOT;
    return s.activePlayer === BOT;
  }

  /** Mossa del bot: il tutorial la sostituisce con le mosse scritte nel copione. */
  protected botAction(): Action {
    const view = getPlayerView(this.state, BOT);
    const legal = getLegalActions(this.state, BOT);
    const decision = this.bot.choose(view, BOT, legal, this.botRng);
    this.botRng = decision.rng;
    return decision.action;
  }

  private scheduleBot(): void {
    if (this.left || this.cancelBot || !this.botMustAct()) return;
    this.cancelBot = this.schedule(this.delay, () => {
      this.cancelBot = null;
      if (this.left || !this.botMustAct()) return;
      this.apply(this.botAction());
    });
  }

  protected emit<K extends keyof ServerMessages>(type: K, payload: ServerMessages[K]): void {
    const handler = this.handlers[type] as ((p: ServerMessages[K]) => void) | undefined;
    if (handler) handler(payload);
    else this.backlog.push({ type, payload });
  }
}

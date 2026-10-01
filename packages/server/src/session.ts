// Una partita lato server (M3), indipendente da Colyseus: posti al tavolo, azioni validate dall'engine,
// viste filtrate per giocatore, timer del turno, riconnessione e abbandono.
// Le dipendenze esterne (invio, orologio, casualità) sono iniettate: così si testa senza rete.

import {
  DATA_VERSION,
  HEROES_BY_ID,
  IllegalActionError,
  applyAction,
  createGame,
  deckCards,
  getEventsView,
  getPlayerView,
  validateDeck,
  type Action,
  type GameEvent,
  type GameSetup,
  type GameState,
  type PlayerId,
} from "@dottorscudo/engine";
import { MULLIGAN_SECONDS, TURN_SECONDS } from "./config";
import type { ServerMessages } from "./protocol";
import type { MatchRecord } from "./store";

export interface SessionDeps {
  send<K extends keyof ServerMessages>(sessionId: string, type: K, payload: ServerMessages[K]): void;
  /** Esegue `fn` tra `ms` millisecondi; restituisce la funzione per annullarlo. */
  schedule(ms: number, fn: () => void): () => void;
  now(): number;
  /** Numero in [0, 1). Solo per seed e scelte automatiche allo scadere del timer, mai per le regole. */
  random(): number;
  /** Chiamata una volta a fine partita (anche per timer o abbandono): storico e replay (T5.3). */
  onGameOver?(record: MatchRecord): void;
}

/** Chi si siede: utente autenticato (null = ospite) e mazzo scelto (assente = precostruito). */
export interface SeatOptions {
  userId?: string | null;
  deck?: string[];
}

export class JoinError extends Error {}

interface Seat {
  sessionId: string;
  heroId: string;
  userId: string | null;
  deck: string[] | null;
  connected: boolean;
}

const PLAYERS = ["p1", "p2"] as const;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // niente 0/O, 1/I

/** Codice invito di 6 caratteri, facile da dettare. */
export function generateCode(random: () => number): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join("");
}

export class GameSession {
  private readonly seats = new Map<PlayerId, Seat>();
  state: GameState | null = null;
  setup: GameSetup | null = null;
  /** Azioni accettate, in ordine: con `setup` permettono il replay (M5). */
  readonly actions: Action[] = [];
  private startedAt = 0;
  private deadline: number | null = null;
  private cancelTimer: (() => void) | null = null;

  constructor(
    readonly code: string,
    private readonly deps: SessionDeps,
  ) {}

  sessionOf(player: PlayerId): string | undefined {
    return this.seats.get(player)?.sessionId;
  }

  playerOf(sessionId: string): PlayerId | undefined {
    for (const p of PLAYERS) if (this.seats.get(p)?.sessionId === sessionId) return p;
    return undefined;
  }

  /** Siede un giocatore. Con il secondo giocatore la partita parte. Lancia JoinError se non è possibile. */
  join(sessionId: string, heroId: string, options: SeatOptions = {}): PlayerId {
    if (!HEROES_BY_ID.has(heroId)) throw new JoinError(`eroe sconosciuto: ${heroId}`);
    if (options.deck) {
      const validation = validateDeck(heroId, options.deck);
      if (!validation.ok) throw new JoinError(`mazzo non valido: ${validation.errors[0]!.message}`);
    }
    const free = PLAYERS.find((p) => !this.seats.has(p));
    if (!free || this.state) throw new JoinError("la stanza è piena");
    this.seats.set(free, { sessionId, heroId, userId: options.userId ?? null, deck: options.deck ?? null, connected: true });
    this.deps.send(sessionId, "joined", { player: free, code: this.code });
    if (this.seats.size < 2) {
      this.deps.send(sessionId, "waiting", { code: this.code });
      return free;
    }
    this.start();
    return free;
  }

  private start(): void {
    const setupOf = (p: PlayerId) => {
      const seat = this.seats.get(p)!;
      return { heroId: seat.heroId, deck: seat.deck ?? deckCards(seat.heroId) };
    };
    this.setup = {
      seed: Math.floor(this.deps.random() * 2 ** 32),
      players: [setupOf("p1"), setupOf("p2")],
    };
    this.startedAt = this.deps.now();
    const { state, events } = createGame(this.setup);
    this.state = state;
    this.restartTimer();
    this.broadcast(events);
  }

  /** Azione da un client: il giocatore lo decide la connessione, non il messaggio. */
  handleAction(sessionId: string, raw: unknown): void {
    const player = this.playerOf(sessionId);
    if (!player || !this.state) {
      this.deps.send(sessionId, "error", { code: "not_in_game", message: "Non sei seduto a questo tavolo" });
      return;
    }
    const action = typeof raw === "object" && raw !== null ? ({ ...raw, player } as Action) : (raw as Action);
    try {
      this.apply(action);
    } catch (e) {
      if (!(e instanceof IllegalActionError)) throw e;
      this.deps.send(sessionId, "error", { code: e.code, message: e.message });
    }
  }

  private apply(action: Action): void {
    const before = this.state!;
    const { state, events } = applyAction(before, action);
    this.state = state;
    this.actions.push(action);
    // Il timer riparte quando cambia il turno o finisce il mulligan; non per ogni azione.
    if (state.turn !== before.turn || state.phase !== before.phase) this.restartTimer();
    this.broadcast(events, action.player);
    if (state.phase === "ended" && before.phase !== "ended") this.deps.onGameOver?.(this.record());
  }

  /** La partita finita, pronta per lo storico. */
  private record(): MatchRecord {
    const state = this.state!;
    return {
      code: this.code,
      setup: this.setup!,
      actions: [...this.actions],
      result: state.result!,
      dataVersion: DATA_VERSION,
      users: { p1: this.seats.get("p1")!.userId, p2: this.seats.get("p2")!.userId },
      turns: state.turn,
      startedAt: this.startedAt,
      endedAt: this.deps.now(),
    };
  }

  private broadcast(events: GameEvent[], actor: PlayerId | null = null): void {
    const state = this.state!;
    for (const p of PLAYERS) {
      const seat = this.seats.get(p);
      if (!seat?.connected) continue;
      this.deps.send(seat.sessionId, "update", { view: getPlayerView(state, p), events: getEventsView(events, p), deadline: this.deadline, actor });
    }
  }

  private restartTimer(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.deadline = null;
    const state = this.state;
    if (!state || state.phase === "ended") return;
    const ms = (state.phase === "mulligan" ? MULLIGAN_SECONDS : TURN_SECONDS) * 1000;
    this.deadline = this.deps.now() + ms;
    this.cancelTimer = this.deps.schedule(ms, () => this.onTimeout());
  }

  /** Allo scadere: mulligan tenuto, scelta di Scopri casuale, poi fine turno (GDD §1.1, §1.2, §3.2). */
  private onTimeout(): void {
    this.cancelTimer = null;
    const state = this.state;
    if (!state || state.phase === "ended") return;
    if (state.phase === "mulligan") {
      for (const p of PLAYERS) {
        if (!this.state!.players[p].mulliganDone) this.apply({ type: "mulligan", player: p, replace: [] });
      }
      return;
    }
    if (state.pendingChoice) {
      const index = Math.floor(this.deps.random() * state.pendingChoice.options.length);
      this.apply({ type: "choose", player: state.pendingChoice.player, index });
    }
    if (this.state!.phase === "main") this.apply({ type: "end_turn", player: this.state!.activePlayer });
  }

  disconnect(sessionId: string): void {
    const player = this.playerOf(sessionId);
    if (!player) return;
    this.seats.get(player)!.connected = false;
    this.notifyOpponent(player, false);
  }

  reconnect(sessionId: string): void {
    const player = this.playerOf(sessionId);
    if (!player) return;
    this.seats.get(player)!.connected = true;
    this.notifyOpponent(player, true);
    if (this.state) this.deps.send(sessionId, "update", { view: getPlayerView(this.state, player), events: [], deadline: this.deadline, actor: null });
  }

  /** Uscita definitiva: in partita è una resa (GDD §7); prima della partita libera il posto. Idempotente. */
  abandon(sessionId: string): void {
    const player = this.playerOf(sessionId);
    if (!player) return;
    if (!this.state) {
      this.seats.delete(player);
      return;
    }
    this.seats.get(player)!.connected = false;
    if (this.state.phase !== "ended") this.apply({ type: "concede", player });
  }

  private notifyOpponent(player: PlayerId, connected: boolean): void {
    const other = this.seats.get(player === "p1" ? "p2" : "p1");
    if (other?.connected) this.deps.send(other.sessionId, "opponent", { connected });
  }

  /** Ferma il timer (stanza chiusa). */
  dispose(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
  }
}

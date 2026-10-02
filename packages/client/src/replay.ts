// Visore dei replay (T5.3): una partita salvata (setup + azioni) rigiocata con l'engine e mostrata nella
// BoardScene come se arrivasse dal server, dal lato di chi guarda. Nessuna mossa possibile.

import {
  getEventsView,
  getPlayerView,
  replay,
  type Action,
  type GameEvent,
  type GameSetup,
  type GameState,
  type PlayerId,
} from "@dottorscudo/engine";
import type { ServerMessages } from "../../server/src/protocol";
import type { MatchConnection, MatchHandlers } from "./match";

export interface ReplayOptions {
  /** Pausa tra un passo e l'altro a velocità ×1 (ms). */
  delayMs?: number;
  /** Per i test: sostituisce setTimeout. */
  schedule?: (ms: number, fn: () => void) => () => void;
}

const defaultSchedule = (ms: number, fn: () => void) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export class ReplayMatch implements MatchConnection {
  private readonly states: GameState[];
  private readonly stepEvents: GameEvent[][];
  private handlers: MatchHandlers = {};
  private readonly backlog: { type: keyof ServerMessages; payload: unknown }[] = [];
  private readonly schedule: NonNullable<ReplayOptions["schedule"]>;
  private readonly delay: number;
  private cancel: (() => void) | null = null;
  private running = false;
  /** Con la plancia collegata: dopo ogni passo si aspetta la fine delle animazioni (boardIdle). */
  private paced = false;
  private waitingIdle = false;
  /** Passo mostrato: 0 = inizio partita, `steps` = fine. */
  private index = 0;
  speed: 1 | 2 | 4 = 1;
  /** Avvisa i controlli a ogni cambio di passo o di stato (play/pausa). */
  onChange: (() => void) | null = null;

  /** Lancia IllegalActionError se le azioni non si rigiocano più (dati di gioco cambiati). */
  constructor(
    setup: GameSetup,
    private readonly actions: readonly Action[],
    readonly viewer: PlayerId,
    options: ReplayOptions = {},
  ) {
    const r = replay(setup, actions);
    this.states = r.states;
    this.stepEvents = r.stepEvents;
    this.schedule = options.schedule ?? defaultSchedule;
    this.delay = options.delayMs ?? 900;
    this.emit("joined", { player: viewer, code: "REPLAY" });
    this.show(0, true);
  }

  get step(): number {
    return this.index;
  }

  get steps(): number {
    return this.actions.length;
  }

  get playing(): boolean {
    return this.running;
  }

  /** Da chiamare una volta, se una plancia mostra il replay: il passo successivo aspetta `boardIdle()`. */
  usePacing(): void {
    this.paced = true;
  }

  /** La plancia ha finito le animazioni del passo mostrato. */
  boardIdle(): void {
    if (!this.waitingIdle) return;
    this.waitingIdle = false;
    if (this.running) this.tick();
  }

  on(handlers: MatchHandlers): void {
    this.handlers = handlers;
    for (const { type, payload } of this.backlog.splice(0)) this.emit(type, payload as never);
  }

  /** Nel replay non si gioca. */
  send(): void {}

  filterLegal(): Action[] {
    return [];
  }

  async leave(): Promise<void> {
    this.pause();
    this.onChange = null;
  }

  play(): void {
    if (this.running) return;
    if (this.index >= this.steps) this.show(0, false);
    this.running = true;
    this.waitingIdle = false;
    this.tick();
  }

  pause(): void {
    this.cancel?.();
    this.cancel = null;
    this.running = false;
    this.waitingIdle = false;
    this.onChange?.();
  }

  /** Un passo avanti, con le animazioni. */
  next(): void {
    if (this.index < this.steps) this.show(this.index + 1, true);
  }

  /** Un passo indietro: niente animazioni, solo lo stato. */
  prev(): void {
    if (this.index > 0) this.show(this.index - 1, false);
  }

  restart(): void {
    this.pause();
    this.show(0, false);
  }

  private tick(): void {
    this.cancel = this.schedule(this.delay / this.speed, () => {
      this.cancel = null;
      // Prima di mostrare il passo: la plancia potrebbe segnalare subito la fine (passo senza animazioni).
      if (this.paced && this.index + 1 < this.steps) this.waitingIdle = true;
      this.next();
      if (this.index >= this.steps) this.running = false;
      else if (!this.paced) this.tick();
      this.onChange?.();
    });
    this.onChange?.();
  }

  private show(index: number, animate: boolean): void {
    this.index = index;
    const action = index > 0 ? this.actions[index - 1]! : null;
    this.emit("update", {
      view: getPlayerView(this.states[index]!, this.viewer),
      events: animate ? getEventsView(this.stepEvents[index]!, this.viewer) : [],
      deadline: null,
      actor: action?.player ?? null,
    });
    this.onChange?.();
  }

  private emit<K extends keyof ServerMessages>(type: K, payload: ServerMessages[K]): void {
    const handler = this.handlers[type] as ((p: ServerMessages[K]) => void) | undefined;
    if (handler) handler(payload);
    else this.backlog.push({ type, payload });
  }
}

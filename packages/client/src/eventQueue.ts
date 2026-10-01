// Adattatore puro (T4.2): coda degli eventi dell'engine da animare, più il log leggibile della partita.
// La BoardScene li consuma uno alla volta per le animazioni; la vista ricevuta resta la verità.

import { createEventLogger, type EventLogger, type GameEvent, type PlayerId } from "@dottorscudo/engine";

export class EventQueue {
  private readonly queue: GameEvent[] = [];
  private readonly lines: string[] = [];
  private readonly logger: EventLogger;

  constructor(
    heroes: Record<PlayerId, string>,
    private readonly maxLog = 60,
  ) {
    this.logger = createEventLogger(heroes);
  }

  push(events: readonly GameEvent[]): void {
    for (const e of events) {
      this.queue.push(e);
      const line = this.logger.format(e);
      if (line !== null) this.lines.push(line.trim());
    }
    if (this.lines.length > this.maxLog) this.lines.splice(0, this.lines.length - this.maxLog);
  }

  next(): GameEvent | undefined {
    return this.queue.shift();
  }

  /** Il prossimo evento, senza toglierlo dalla coda. */
  peek(): GameEvent | undefined {
    return this.queue[0];
  }

  get size(): number {
    return this.queue.length;
  }

  get log(): readonly string[] {
    return this.lines;
  }

  /** Svuota le animazioni in sospeso (es. riconnessione): il log resta. */
  clear(): void {
    this.queue.length = 0;
  }
}

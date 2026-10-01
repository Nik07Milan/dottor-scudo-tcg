// Connessione al server (T4.1, T4.5): crea o entra in una stanza con codice, invia azioni, riceve viste.
// Il token di riconnessione resta nel browser: ricaricando la pagina si torna alla partita.

import { Client, type Room } from "@colyseus/sdk";
import type { ClientAction, ServerMessages } from "../../server/src/protocol";
import type { MatchConnection, MatchHandlers } from "./match";

const ROOM = "game";
const TOKEN_KEY = "dottorscudo.reconnect";
const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? `${location.protocol}//${location.hostname}:2567`;

type Handlers = MatchHandlers;

export class Connection implements MatchConnection {
  private readonly client = new Client(SERVER_URL);
  private room: Room | null = null;
  private handlers: Handlers = {};
  /** Messaggi arrivati prima che una scena si registrasse (es. il primo `update`). */
  private readonly backlog: { type: keyof ServerMessages; payload: unknown }[] = [];

  get code(): string | null {
    return this.room?.roomId ?? null;
  }

  async create(heroId: string): Promise<void> {
    this.attach(await this.client.create(ROOM, { heroId }));
  }

  async join(code: string, heroId: string): Promise<void> {
    this.attach(await this.client.joinById(code.trim().toUpperCase(), { heroId }));
  }

  /** Prova a tornare nella partita lasciata (ricarica della pagina). */
  async resume(): Promise<boolean> {
    const token = safeStorage("get");
    if (!token) return false;
    try {
      this.attach(await this.client.reconnect(token));
      return true;
    } catch {
      safeStorage("remove");
      return false;
    }
  }

  /** Registra i gestori di una scena; consegna subito i messaggi in attesa. */
  on(handlers: Handlers): void {
    this.handlers = handlers;
    for (const { type, payload } of this.backlog.splice(0)) this.dispatch(type, payload);
  }

  send(action: ClientAction): void {
    this.room?.send("action", action);
  }

  async leave(): Promise<void> {
    safeStorage("remove");
    await this.room?.leave(true);
    this.room = null;
  }

  private attach(room: Room): void {
    this.room = room;
    if (import.meta.env.DEV) devHook().code = room.roomId;
    safeStorage("set", room.reconnectionToken);
    for (const type of ["joined", "waiting", "update", "error", "opponent"] as const) {
      room.onMessage(type, (payload: unknown) => this.dispatch(type, payload));
    }
    room.onLeave(() => safeStorage("remove"));
  }

  private dispatch(type: keyof ServerMessages, payload: unknown): void {
    if (import.meta.env.DEV) devHook()[type] = payload;
    const handler = this.handlers[type] as ((p: unknown) => void) | undefined;
    if (handler) handler(payload);
    else this.backlog.push({ type, payload });
  }
}

/**
 * Solo in sviluppo: codice e ultimi messaggi leggibili dai test end-to-end, perché il codice invito è
 * disegnato nel canvas. In produzione `import.meta.env.DEV` è false e Vite toglie il codice.
 */
function devHook(): Record<string, unknown> {
  return ((window as unknown as { __DS__?: Record<string, unknown> }).__DS__ ??= {});
}

/** localStorage può mancare o lanciare (navigazione privata): il gioco funziona lo stesso. */
function safeStorage(op: "get" | "set" | "remove", value?: string): string | null {
  try {
    if (op === "get") return localStorage.getItem(TOKEN_KEY);
    if (op === "set") localStorage.setItem(TOKEN_KEY, value!);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignora
  }
  return null;
}

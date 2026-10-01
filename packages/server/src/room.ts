// Stanza Colyseus (T3.1–T3.5): adattatore sottile tra Colyseus e GameSession. Nessuna regola qui.
// Lo stato non è uno schema sincronizzato: ogni client riceve la propria vista filtrata come messaggio.

import { randomInt } from "node:crypto";
import { Room, type AuthContext, type Client } from "colyseus";
import { RECONNECT_SECONDS } from "./config";
import type { JoinOptions } from "./protocol";
import { GameSession, JoinError, generateCode, type SessionDeps } from "./session";
import { loadSeatDeck, type Store } from "./store";

/** Casualità del server (seed e scelte allo scadere del timer): crittografica, mai Math.random. */
const serverRandom = () => randomInt(0, 2 ** 32) / 2 ** 32;

/** Persistenza (T5.3), impostata all'avvio. null = ospiti, mazzi precostruiti, niente storico. */
let store: Store | null = null;
export function configureStore(s: Store | null): void {
  store = s;
}

/** Risultato di onAuth, disponibile come `client.auth`. */
interface Auth {
  userId: string | null;
}

export class GameRoom extends Room {
  maxClients = 2;
  session!: GameSession;

  messages = {
    action: (client: Client, payload: unknown) => this.session.handleAction(client.sessionId, payload),
  };

  onCreate(): void {
    // Il codice invito è il roomId: si entra con joinById(codice). Stanza privata: niente joinOrCreate.
    this.roomId = generateCode(serverRandom);
    void this.setPrivate(true);
    const deps: SessionDeps = {
      send: (sessionId, type, payload) => this.clients.find((c) => c.sessionId === sessionId)?.send(type, payload),
      schedule: (ms, fn) => {
        const delayed = this.clock.setTimeout(fn, ms);
        return () => delayed.clear();
      },
      now: () => Date.now(),
      random: serverRandom,
      onGameOver: (record) => {
        // Le partite tra soli ospiti non hanno storico da mostrare a nessuno.
        if (!store || (!record.users.p1 && !record.users.p2)) return;
        store.saveMatch(record).catch((e: unknown) => console.error(`[${record.code}] ${e instanceof Error ? e.message : String(e)}`));
      },
    };
    this.session = new GameSession(this.roomId, deps);
  }

  /** Senza token si entra come ospite; un token non valido rifiuta l'ingresso. */
  async onAuth(_client: Client, _options: JoinOptions, context: AuthContext): Promise<Auth> {
    if (!context.token || !store) return { userId: null };
    const userId = await store.verifyUser(context.token);
    if (!userId) throw new JoinError("sessione scaduta: accedi di nuovo");
    return { userId };
  }

  async onJoin(client: Client, options: JoinOptions): Promise<void> {
    // Un JoinError qui rifiuta l'ingresso: il client riceve l'errore.
    const userId = (client.auth as Auth | undefined)?.userId ?? null;
    const heroId = options?.heroId;
    const deck = options?.deckId ? await loadSeatDeck(store, userId, heroId, options.deckId) : undefined;
    this.session.join(client.sessionId, heroId, { userId, deck });
  }

  async onDrop(client: Client): Promise<void> {
    this.session.disconnect(client.sessionId);
    // Se non torna entro la finestra, Colyseus chiama onLeave: lì diventa abbandono.
    await this.allowReconnection(client, RECONNECT_SECONDS);
  }

  onReconnect(client: Client): void {
    this.session.reconnect(client.sessionId);
  }

  onLeave(client: Client): void {
    this.session.abandon(client.sessionId);
  }

  onDispose(): void {
    this.session.dispose();
  }
}

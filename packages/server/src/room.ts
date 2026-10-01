// Stanza Colyseus (T3.1–T3.5): adattatore sottile tra Colyseus e GameSession. Nessuna regola qui.
// Lo stato non è uno schema sincronizzato: ogni client riceve la propria vista filtrata come messaggio.

import { randomInt } from "node:crypto";
import { Room, type Client } from "colyseus";
import { RECONNECT_SECONDS } from "./config";
import type { JoinOptions } from "./protocol";
import { GameSession, generateCode, type SessionDeps } from "./session";

/** Casualità del server (seed e scelte allo scadere del timer): crittografica, mai Math.random. */
const serverRandom = () => randomInt(0, 2 ** 32) / 2 ** 32;

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
    };
    this.session = new GameSession(this.roomId, deps);
  }

  onJoin(client: Client, options: JoinOptions): void {
    // Un JoinError qui rifiuta l'ingresso: il client riceve l'errore.
    this.session.join(client.sessionId, options?.heroId);
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

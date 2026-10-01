// Contesto di risoluzione di un'azione: bozza dello stato (già copiata, si può modificare) + eventi emessi.
// applyAction crea il contesto con una copia profonda, quindi lo stato del chiamante non cambia mai.

import type { CardInstance, GameEvent, GameState, InstanceId, PlayerId } from "./state";

export interface Ctx {
  state: GameState;
  events: GameEvent[];
}

export const opponentOf = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1");

export function newInstanceId(ctx: Ctx): InstanceId {
  return ctx.state.nextInstanceId++;
}

export function newCard(ctx: Ctx, cardId: string): CardInstance {
  return { instanceId: newInstanceId(ctx), cardId, costModifier: 0 };
}

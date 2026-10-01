// Contesto di risoluzione di un'azione: bozza dello stato (già copiata, si può modificare) + eventi emessi.
// applyAction crea il contesto con una copia profonda, quindi lo stato del chiamante non cambia mai.

import type { CardInstance, GameEvent, GameState, InstanceId, PlayerId } from "./state";

export interface Ctx {
  state: GameState;
  events: GameEvent[];
  /**
   * Servitori distrutti in questa risoluzione, in attesa della fase morti. Transitorio: vive solo
   * durante un'azione e non entra mai nello stato.
   */
  doomed?: Set<InstanceId>;
  /** Passi di risoluzione (EffectAction risolte) in questa azione. Rete contro le catene infinite. */
  steps?: number;
  /** Superato RESOLUTION_STEP_LIMIT: si smette di risolvere e la partita finisce in pareggio (GDD §1.5.8). */
  aborted?: boolean;
}

export const opponentOf = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1");

export function newInstanceId(ctx: Ctx): InstanceId {
  return ctx.state.nextInstanceId++;
}

export function newCard(ctx: Ctx, cardId: string): CardInstance {
  return { instanceId: newInstanceId(ctx), cardId, costModifier: 0 };
}

export function doom(ctx: Ctx, instanceId: InstanceId): void {
  (ctx.doomed ??= new Set()).add(instanceId);
}

export const isDoomed = (ctx: Ctx, instanceId: InstanceId): boolean => ctx.doomed?.has(instanceId) ?? false;

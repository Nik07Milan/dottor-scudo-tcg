// Task (T1.11, GDD §3.3): zona Task, progresso pubblico, ricompensa subito al completamento.

import { newCard, type Ctx } from "./context";
import { CARDS_BY_ID } from "./data";
import { resolveEffects } from "./effects";
import { MAX_BOARD } from "./rules";
import type { PlayerId } from "./state";
import { addToHand } from "./turn";
import type { TaskDefinition } from "./types";

/** Mette la Task giocata nella zona Task del giocatore. */
export function startTask(ctx: Ctx, player: PlayerId, cardId: string): void {
  const def = CARDS_BY_ID.get(cardId)!.task!;
  ctx.state.players[player].task = { cardId, progress: 0, goal: def.goal };
  ctx.events.push({ type: "task_progress", player, cardId, progress: 0, goal: def.goal });
}

/** Un passo di progresso per la Task di `player`, se conta questo tipo di evento. */
export function advanceTask(ctx: Ctx, player: PlayerId, counter: TaskDefinition["counter"]): void {
  const ps = ctx.state.players[player];
  const task = ps.task;
  if (!task) return;
  const def = CARDS_BY_ID.get(task.cardId)!.task!;
  if (def.counter !== counter) return;

  task.progress += 1;
  ctx.events.push({ type: "task_progress", player, cardId: task.cardId, progress: task.progress, goal: task.goal });
  if (task.progress < task.goal) return;

  // Completata: lascia la zona prima della ricompensa, così la ricompensa non conta per sé stessa.
  ps.task = null;
  ctx.events.push({ type: "task_completed", player, cardId: task.cardId });
  for (const action of def.reward) {
    if (action.kind === "summon" && !action.forOpponent && ps.board.length >= MAX_BOARD) {
      // Scrivania piena: la ricompensa va in mano (GDD §3.3).
      for (let i = 0; i < action.count; i++) addToHand(ctx, player, newCard(ctx, action.cardId));
      continue;
    }
    resolveEffects(ctx, [{ trigger: "on_play", action }], { player, cardId: task.cardId });
  }
}

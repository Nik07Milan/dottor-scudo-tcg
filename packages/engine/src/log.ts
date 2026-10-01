// Log leggibile degli eventi (T1.20), in italiano. Puro: lo usano la CLI e, in futuro, il client.
// Tiene una mappa instanceId → carta per dare un nome ai servitori citati per id.

import { CARDS_BY_ID, HEROES_BY_ID } from "./data";
import type { CharacterRef, GameEvent, PlayerId } from "./state";

export interface EventLogger {
  /** Riga di log per l'evento, o null per gli eventi che non vale la pena mostrare. */
  format(event: GameEvent): string | null;
}

const RESULT_REASON: Record<string, string> = {
  hero_defeated: "ferie a zero",
  concede: "resa",
  turn_limit: "limite di turni",
  resolution_limit: "catena infinita",
};

/** `heroes`: eroe di ogni giocatore, per i nomi. */
export function createEventLogger(heroes: Record<PlayerId, string>): EventLogger {
  const minions = new Map<number, string>();
  const card = (id: string) => CARDS_BY_ID.get(id)?.name ?? id;
  const hero = (p: PlayerId) => `${HEROES_BY_ID.get(heroes[p])?.name ?? heroes[p]} (${p})`;
  const who = (ref: CharacterRef) => (ref.kind === "hero" ? hero(ref.player) : card(minions.get(ref.instanceId) ?? "?"));

  return {
    format(e) {
      switch (e.type) {
        case "game_started":
          return `Inizia la partita: ${hero("p1")} contro ${hero("p2")}. Primo: ${e.firstPlayer}.`;
        case "mulligan_done":
          return `${e.player} cambia ${e.replaced} carte.`;
        case "turn_started":
          return `\n— Turno ${e.turn}: ${hero(e.player)} —`;
        case "card_played":
          return `${e.player} gioca ${card(e.cardId)}${e.target ? ` su ${who(e.target)}` : ""}.`;
        case "hero_power_used":
          return `${e.player} usa il potere eroe${e.target ? ` su ${who(e.target)}` : ""}.`;
        case "minion_summoned":
          minions.set(e.instanceId, e.cardId);
          return `  entra ${card(e.cardId)} sulla scrivania di ${e.player}.`;
        case "weapon_equipped":
          return `  ${e.player} equipaggia ${card(e.cardId)}.`;
        case "weapon_destroyed":
          return `  ${card(e.cardId)} di ${e.player} si rompe.`;
        case "attack":
          return `${who(e.attacker)} attacca ${who(e.defender)}.`;
        case "damage":
          return `  ${who(e.target)} subisce ${e.amount} danni.`;
        case "heal":
          return `  ${who(e.target)} recupera ${e.amount}.`;
        case "armor_gained":
          return `  ${hero(e.player)} ottiene ${e.amount} armatura.`;
        case "shield_broken":
          return `  lo Scudato di ${who(e.target)} si rompe.`;
        case "minion_died":
          return `  muore ${card(e.cardId)} (${e.player}).`;
        case "control_changed":
          return `  ${e.to} prende il controllo di ${card(minions.get(e.instanceId) ?? "?")}.`;
        case "fatigue":
          return `  Burnout: ${hero(e.player)} subisce ${e.damage} danni.`;
        case "card_burned":
          return `  ${e.player} ha la mano piena: brucia ${card(e.cardId)}.`;
        case "task_completed":
          return `  ${e.player} completa la Task ${card(e.cardId)}!`;
        case "card_chosen":
          return `  ${e.player} sceglie ${card(e.cardId)}.`;
        case "game_over":
          return e.result.winner
            ? `\nVince ${hero(e.result.winner)} (${RESULT_REASON[e.result.reason]}).`
            : `\nPareggio (${RESULT_REASON[e.result.reason]}).`;
        default:
          return null;
      }
    },
  };
}

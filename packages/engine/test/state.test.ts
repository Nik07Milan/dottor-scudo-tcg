import { describe, expect, it } from "vitest";
import { CARDS_BY_ID, HEROES } from "../src/data";
import * as rules from "../src/rules";
import type { GameState, PlayerId, PlayerState } from "../src/state";

const player = (id: PlayerId, heroId: string): PlayerState => ({
  id,
  hero: { heroId, health: rules.HERO_MAX_HEALTH, maxHealth: rules.HERO_MAX_HEALTH, armor: 0, attacksThisTurn: 0, heroPowerUsed: false },
  weapon: { instanceId: 9, cardId: "scudo-bike", attack: 2, durability: 2 },
  mana: { max: 3, available: 1 },
  deck: [{ instanceId: 1, cardId: "chiamata-api", costModifier: 0 }],
  hand: [{ instanceId: 2, cardId: "re-klaudio", costModifier: -1 }],
  board: [
    {
      instanceId: 3,
      cardId: "il-crudo",
      owner: id,
      attack: 5,
      health: 4,
      maxHealth: 6,
      keywords: ["burocrazia"],
      frozenTurns: 1,
      frozenOnTurn: 4,
      attacksThisTurn: 0,
      summonedThisTurn: false,
    },
  ],
  graveyard: ["miletta"],
  played: ["sasso", "sasso"],
  task: { cardId: "le-task", progress: 2, goal: 5 },
  costModifiers: [{ filter: { type: "spell" }, amount: -2, expiresEndOfTurn: true }],
  fatigue: 0,
  mulliganDone: true,
});

describe("stato di gioco", () => {
  it("è JSON puro: sopravvive a serializzazione e deserializzazione", () => {
    const state: GameState = {
      rng: 123456,
      phase: "main",
      turn: 5,
      activePlayer: "p1",
      firstPlayer: "p2",
      players: { p1: player("p1", "dottor-scudo"), p2: player("p2", "dr-grappolo") },
      pendingChoice: { kind: "discover", player: "p1", options: ["klaudioken", "retcon", "sasso"] },
      result: null,
      nextInstanceId: 10,
    };
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe("costanti delle regole", () => {
  it("il Caffettino del secondo giocatore è un token esistente", () => {
    expect(CARDS_BY_ID.get(rules.COIN_CARD_ID)?.rarity).toBe("token");
  });

  it("ogni potere eroe costa HERO_POWER_COST", () => {
    for (const h of HEROES) expect(h.heroPower.cost, h.id).toBe(rules.HERO_POWER_COST);
  });
});

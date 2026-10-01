import { describe, expect, it } from "vitest";
import { applyAction } from "../src/apply";
import { IllegalActionError, type IllegalActionCode } from "../src/errors";
import { getLegalActions } from "../src/legal";
import * as rules from "../src/rules";
import type { Action, CharacterRef, GameState, MinionInstance, PlayerId } from "../src/state";
import { endTurn, fillBoard, other, startedGame } from "./helpers";

const hero = (player: PlayerId): CharacterRef => ({ kind: "hero", player });
const minion = (m: MinionInstance): CharacterRef => ({ kind: "minion", instanceId: m.instanceId });

/** Turno 1 con un servitore per lato, stats a scelta. Il servitore di `me` può attaccare. */
function arena(mine: [number, number] = [3, 4], theirs: [number, number] = [2, 5]) {
  const state = startedGame();
  const me = state.activePlayer;
  const foe = other(me);
  fillBoard(state, me, 1);
  fillBoard(state, foe, 1);
  const a = state.players[me].board[0]!;
  const d = state.players[foe].board[0]!;
  [a.attack, a.health, a.maxHealth] = [mine[0], mine[1], mine[1]];
  [d.attack, d.health, d.maxHealth] = [theirs[0], theirs[1], theirs[1]];
  return { state, me, foe, a, d };
}

const attack = (state: GameState, attacker: CharacterRef, defender: CharacterRef) =>
  applyAction(state, { type: "attack", player: state.activePlayer, attacker, defender });

const codeOf = (state: GameState, action: Action): IllegalActionCode | "accepted" => {
  try {
    applyAction(state, action);
    return "accepted";
  } catch (e) {
    if (e instanceof IllegalActionError) return e.code;
    throw e;
  }
};

const attacks = (state: GameState, p: PlayerId) => getLegalActions(state, p).filter((a) => a.type === "attack");

describe("mosse legali di attacco", () => {
  it("un servitore pronto può attaccare il servitore e l'eroe nemici", () => {
    const { state, me, foe, a, d } = arena();
    expect(attacks(state, me)).toEqual([
      { type: "attack", player: me, attacker: minion(a), defender: minion(d) },
      { type: "attack", player: me, attacker: minion(a), defender: hero(foe) },
    ]);
  });

  it("un servitore appena entrato in campo non attacca", () => {
    const { state, me, a } = arena();
    a.summonedThisTurn = true;
    expect(attacks(state, me)).toEqual([]);
    expect(codeOf(state, { type: "attack", player: me, attacker: minion(a), defender: hero(other(me)) })).toBe("cannot_attack");
  });

  it("un servitore con 0 attacco non attacca", () => {
    const { state, me, a } = arena([0, 4]);
    expect(attacks(state, me)).toEqual([]);
    expect(codeOf(state, { type: "attack", player: me, attacker: minion(a), defender: hero(other(me)) })).toBe("cannot_attack");
  });

  it("non si attacca con i personaggi nemici né i propri personaggi", () => {
    const { state, me, foe, a, d } = arena();
    expect(codeOf(state, { type: "attack", player: me, attacker: minion(d), defender: hero(foe) })).toBe("invalid_attacker");
    expect(codeOf(state, { type: "attack", player: me, attacker: hero(foe), defender: minion(a) })).toBe("invalid_attacker");
    expect(codeOf(state, { type: "attack", player: me, attacker: minion(a), defender: hero(me) })).toBe("invalid_target");
    expect(codeOf(state, { type: "attack", player: me, attacker: minion(a), defender: { kind: "minion", instanceId: 999_999 } })).toBe(
      "invalid_target",
    );
  });

  it("fuori turno non si attacca", () => {
    const { state, foe, d, me } = arena();
    d.summonedThisTurn = false;
    expect(attacks(state, foe)).toEqual([]);
    expect(codeOf(state, { type: "attack", player: foe, attacker: minion(d), defender: hero(me) })).toBe("not_your_turn");
  });

  it("riferimenti malformati vengono rifiutati come 'malformed'", () => {
    const { state, me } = arena();
    for (const bad of [
      { type: "attack", player: me },
      { type: "attack", player: me, attacker: { kind: "hero" }, defender: hero(other(me)) },
      { type: "attack", player: me, attacker: { kind: "minion", instanceId: "x" }, defender: hero(other(me)) },
      { type: "attack", player: me, attacker: hero(me), defender: { kind: "drago" } },
    ]) {
      expect(codeOf(state, bad as Action), JSON.stringify(bad)).toBe("malformed");
    }
  });
});

describe("servitore contro servitore", () => {
  it("i danni sono reciproci e contemporanei", () => {
    const { state, me, foe, a, d } = arena([3, 4], [2, 5]);
    const { state: s, events } = attack(state, minion(a), minion(d));
    expect(s.players[me].board[0]!.health).toBe(2);
    expect(s.players[foe].board[0]!.health).toBe(2);
    expect(events).toEqual([
      { type: "attack", attacker: minion(a), defender: minion(d) },
      { type: "damage", target: minion(d), amount: 3 },
      { type: "damage", target: minion(a), amount: 2 },
    ]);
  });

  it("un servitore attacca una volta per turno; al suo turno successivo può riattaccare", () => {
    const { state, me, foe, a } = arena([1, 9], [1, 9]);
    const once = attack(state, minion(a), hero(foe)).state;
    expect(once.players[me].board[0]!.attacksThisTurn).toBe(1);
    expect(attacks(once, me)).toEqual([]);
    expect(codeOf(once, { type: "attack", player: me, attacker: minion(a), defender: hero(foe) })).toBe("cannot_attack");

    const nextMine = endTurn(endTurn(once).state).state;
    expect(attacks(nextMine, me).length).toBeGreaterThan(0);
  });

  it("chi scende a 0 o meno muore: lascia la scrivania e va nel cimitero", () => {
    const { state, me, foe, a, d } = arena([5, 4], [3, 5]);
    const { state: s, events } = attack(state, minion(a), minion(d));
    expect(s.players[foe].board).toEqual([]);
    expect(s.players[foe].graveyard).toEqual([d.cardId]);
    expect(s.players[me].board[0]!.health).toBe(1);
    expect(events.at(-1)).toEqual({ type: "minion_died", player: foe, instanceId: d.instanceId, cardId: d.cardId });
  });

  it("se muoiono entrambi escono insieme, prima quelli del giocatore di turno", () => {
    const { state, me, foe, a, d } = arena([5, 2], [4, 5]);
    const { state: s, events } = attack(state, minion(a), minion(d));
    expect(s.players[me].board).toEqual([]);
    expect(s.players[foe].board).toEqual([]);
    expect(events.filter((e) => e.type === "minion_died").map((e) => e.type === "minion_died" && e.player)).toEqual([me, foe]);
  });
});

describe("servitore contro eroe", () => {
  it("l'eroe subisce il danno e non risponde; l'armatura assorbe per prima", () => {
    const { state, me, foe, a } = arena([4, 4]);
    state.players[foe].hero.armor = 1;
    const { state: s } = attack(state, minion(a), hero(foe));
    expect(s.players[foe].hero).toMatchObject({ armor: 0, health: rules.HERO_MAX_HEALTH - 3 });
    expect(s.players[me].board[0]!.health).toBe(4);
  });

  it("un colpo letale all'eroe chiude la partita", () => {
    const { state, me, foe, a } = arena([4, 4]);
    state.players[foe].hero.health = 4;
    const r = attack(state, minion(a), hero(foe));
    expect(r.state.result).toEqual({ winner: me, reason: "hero_defeated" });
  });
});

describe("attacco dell'eroe con uno Strumento", () => {
  function armed(attackValue = 2, durability = 2) {
    const ctx = arena([1, 1], [3, 5]);
    ctx.state.players[ctx.me].weapon = { instanceId: ctx.state.nextInstanceId++, cardId: "scudo-bike", attack: attackValue, durability };
    return ctx;
  }

  it("senza Strumento l'eroe non attacca", () => {
    const { state, me, foe } = arena();
    expect(attacks(state, me).some((a) => a.type === "attack" && a.attacker.kind === "hero")).toBe(false);
    expect(codeOf(state, { type: "attack", player: me, attacker: hero(me), defender: hero(foe) })).toBe("cannot_attack");
  });

  it("l'eroe armato può attaccare servitori ed eroe nemici", () => {
    const { state, me, foe, d } = armed();
    const heroAttacks = attacks(state, me).filter((a) => a.type === "attack" && a.attacker.kind === "hero");
    expect(heroAttacks).toEqual([
      { type: "attack", player: me, attacker: hero(me), defender: minion(d) },
      { type: "attack", player: me, attacker: hero(me), defender: hero(foe) },
    ]);
  });

  it("contro un servitore l'eroe subisce il contrattacco (prima l'armatura) e lo Strumento perde 1 durabilità", () => {
    const { state, me, foe, d } = armed(2, 2);
    state.players[me].hero.armor = 1;
    const { state: s } = attack(state, hero(me), minion(d));
    expect(s.players[foe].board[0]!.health).toBe(3);
    // L'armatura (1) assorbe parte del contrattacco (3); poi Scudo-bike ridà 1 armatura dopo l'attacco.
    expect(s.players[me].hero).toMatchObject({ armor: 1, health: rules.HERO_MAX_HEALTH - 2, attacksThisTurn: 1 });
    expect(s.players[me].weapon?.durability).toBe(1);
  });

  it("contro l'eroe nemico non c'è contrattacco", () => {
    const { state, me, foe } = armed(2, 2);
    const { state: s } = attack(state, hero(me), hero(foe));
    expect(s.players[foe].hero.health).toBe(rules.HERO_MAX_HEALTH - 2);
    expect(s.players[me].hero.health).toBe(rules.HERO_MAX_HEALTH);
  });

  it("a durabilità 0 lo Strumento è distrutto", () => {
    const { state, me, foe } = armed(2, 1);
    const { state: s, events } = attack(state, hero(me), hero(foe));
    expect(s.players[me].weapon).toBeNull();
    expect(events).toContainEqual({ type: "weapon_destroyed", player: me, cardId: "scudo-bike" });
  });

  it("l'eroe attacca una volta per turno", () => {
    const { state, me, foe } = armed(2, 3);
    const once = attack(state, hero(me), hero(foe)).state;
    expect(codeOf(once, { type: "attack", player: me, attacker: hero(me), defender: hero(foe) })).toBe("cannot_attack");
  });

  it("l'eroe può attaccare nel turno in cui equipaggia lo Strumento", () => {
    const s = startedGame();
    const me = s.activePlayer;
    s.players[me].hand = [{ instanceId: s.nextInstanceId++, cardId: "scudo-bike", costModifier: 0 }];
    s.players[me].mana = { max: 3, available: 3 };
    const equipped = applyAction(s, { type: "play_card", player: me, card: s.players[me].hand[0]!.instanceId }).state;
    expect(attacks(equipped, me)).toContainEqual({ type: "attack", player: me, attacker: hero(me), defender: hero(other(me)) });
  });
});

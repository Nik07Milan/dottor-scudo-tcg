import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/apply";
import type { GameState, MinionInstance } from "../../src/state";
import { addMinion, codeOf, endTurn, heroRef, minionRef, withHand } from "../helpers";
import { attackTargets, table } from "./kw";

const canAttack = (s: GameState, m: MinionInstance) => attackTargets(s, minionRef(m)).length > 0;
const find = (s: GameState, m: MinionInstance) => [...s.players.p1.board, ...s.players.p2.board].find((x) => x.instanceId === m.instanceId)!;

describe("Bloccato in riunione", () => {
  it("un servitore bloccato non può attaccare", () => {
    const { state, me, foe } = table();
    const m = addMinion(state, me, { frozenTurns: 1, frozenOnTurn: state.turn - 1 });
    expect(canAttack(state, m)).toBe(false);
    expect(codeOf(state, { type: "attack", player: me, attacker: minionRef(m), defender: heroRef(foe) })).toBe("cannot_attack");
  });

  it("bloccato nel turno avversario: salta il suo prossimo turno, poi è libero", () => {
    const { state, me, foe } = table();
    const victim = addMinion(state, foe);
    const { state: s, ids } = withHand(state, me, ["riunione-infinita"]);
    const frozen = applyAction(s, { type: "play_card", player: me, card: ids[0]! }).state;
    expect(find(frozen, victim)).toMatchObject({ frozenTurns: 1, frozenOnTurn: frozen.turn });

    const theirTurn = endTurn(frozen).state;
    expect(canAttack(theirTurn, victim)).toBe(false);
    const { state: afterTheirTurn, events } = endTurn(theirTurn);
    expect(find(afterTheirTurn, victim)).toMatchObject({ frozenTurns: 0, frozenOnTurn: null });
    expect(events).toContainEqual({ type: "frozen", instanceId: victim.instanceId, turns: 0 });

    const theirNext = endTurn(afterTheirTurn).state;
    expect(canAttack(theirNext, victim)).toBe(true);
  });

  it("bloccato per 2 turni salta due suoi turni", () => {
    const { state, me, foe } = table();
    const victim = addMinion(state, foe, { frozenTurns: 2, frozenOnTurn: state.turn });
    let s = endTurn(state).state; // turno di foe: bloccato
    expect(canAttack(s, victim)).toBe(false);
    s = endTurn(endTurn(s).state).state; // di nuovo foe: ancora bloccato
    expect(canAttack(s, victim)).toBe(false);
    s = endTurn(endTurn(s).state).state; // terzo turno di foe: libero
    expect(canAttack(s, victim)).toBe(true);
    void me;
  });

  it("bloccato durante il proprio turno: non si sblocca alla fine di quel turno", () => {
    const { state, me } = table();
    const m = addMinion(state, me, { frozenTurns: 1, frozenOnTurn: state.turn });
    const s = endTurn(state).state;
    expect(find(s, m).frozenTurns).toBe(1);
    const mine = endTurn(s).state;
    expect(canAttack(mine, m)).toBe(false);
  });

  it("solo i servitori del giocatore di turno si sbloccano a fine turno", () => {
    const { state, me, foe } = table();
    const theirs = addMinion(state, foe, { frozenTurns: 1, frozenOnTurn: state.turn - 1 });
    const s = endTurn(state).state; // fine del turno di me: quello di foe resta bloccato
    expect(find(s, theirs).frozenTurns).toBe(1);
    void me;
  });
});

import { describe, expect, it } from "vitest";
import { addMinion, codeOf, heroRef, minionRef, withHand } from "../helpers";
import { attack, attackTargets, playTargets, table } from "./kw";

describe("Burocrazia", () => {
  it("se il nemico ha Burocrazia, i servitori possono attaccare solo quei servitori", () => {
    const { state, me, foe } = table();
    const a = addMinion(state, me);
    const taunt = addMinion(state, foe, { keywords: ["burocrazia"] });
    addMinion(state, foe);
    expect(attackTargets(state, minionRef(a))).toEqual([minionRef(taunt)]);
  });

  it("vale anche per l'eroe armato", () => {
    const { state, me, foe } = table();
    state.players[me].weapon = { instanceId: state.nextInstanceId++, cardId: "scudo-bike", attack: 2, durability: 2 };
    const taunt = addMinion(state, foe, { keywords: ["burocrazia"] });
    expect(attackTargets(state, heroRef(me))).toEqual([minionRef(taunt)]);
  });

  it("con più servitori con Burocrazia si sceglie tra loro", () => {
    const { state, me, foe } = table();
    const a = addMinion(state, me);
    const t1 = addMinion(state, foe, { keywords: ["burocrazia"] });
    addMinion(state, foe);
    const t2 = addMinion(state, foe, { keywords: ["burocrazia"] });
    expect(attackTargets(state, minionRef(a))).toEqual([minionRef(t1), minionRef(t2)]);
  });

  it("attaccare altro dà taunt_required", () => {
    const { state, me, foe } = table();
    const a = addMinion(state, me);
    const plain = addMinion(state, foe);
    addMinion(state, foe, { keywords: ["burocrazia"] });
    const act = (defender: object) => codeOf(state, { type: "attack", player: me, attacker: minionRef(a), defender });
    expect(act(heroRef(foe))).toBe("taunt_required");
    expect(act(minionRef(plain))).toBe("taunt_required");
  });

  it("una Burocrazia in Smart working non obbliga nessuno", () => {
    const { state, me, foe } = table();
    const a = addMinion(state, me);
    addMinion(state, foe, { keywords: ["burocrazia", "smart_working"] });
    const plain = addMinion(state, foe);
    expect(attackTargets(state, minionRef(a))).toEqual([minionRef(plain), heroRef(foe)]);
  });

  it("morta la Burocrazia si torna liberi", () => {
    const { state, me, foe } = table();
    const a = addMinion(state, me, { attack: 5 });
    const b = addMinion(state, me, { attack: 5 });
    const taunt = addMinion(state, foe, { keywords: ["burocrazia"], health: 3 });
    const s = attack(state, minionRef(a), minionRef(taunt)).state;
    expect(attackTargets(s, minionRef(b))).toEqual([heroRef(foe)]);
  });

  it("non vincola le Pratiche", () => {
    const { state, me, foe } = table();
    addMinion(state, foe, { keywords: ["burocrazia"] });
    const { state: s, ids } = withHand(state, me, ["chiamata-api"]);
    expect(playTargets(s, ids[0]!)).toContainEqual(heroRef(foe));
  });

  it("non vincola chi la possiede: i propri servitori con Burocrazia non contano", () => {
    const { state, me, foe } = table();
    const a = addMinion(state, me, { keywords: ["burocrazia"] });
    expect(attackTargets(state, minionRef(a))).toEqual([heroRef(foe)]);
  });
});

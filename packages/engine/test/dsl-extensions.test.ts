import { afterEach, describe, expect, it } from "vitest";
import { applyAction } from "../src/apply";
import type { Ctx } from "../src/context";
import { effectiveCost } from "../src/costs";
import { runEffects } from "../src/effects";
import { CARDS_BY_ID } from "../src/data";
import { getLegalActions } from "../src/legal";
import * as rules from "../src/rules";
import type { GameState, PlayerId } from "../src/state";
import { addMinion, clearTestCards, codeOf, endTurn, fillBoard, heroRef, minionRef, other, startedGame, withHand } from "./helpers";
import { attack, attackTargets, playTargets } from "./keywords/kw";

afterEach(clearTestCards);

function table(hand: string[]) {
  const s0 = startedGame();
  const me = s0.activePlayer;
  const { state, ids } = withHand(s0, me, hand);
  state.players[me].mana.available = 30;
  return { state, me, foe: other(me), ids };
}

const play = (state: GameState, player: PlayerId, card: number, extra: object = {}) =>
  applyAction(state, { type: "play_card", player, card, ...extra });

describe("filtri sul bersaglio scelto", () => {
  it("Serranikson: solo servitori nemici con 3 o meno attacco", () => {
    const { state, me, foe, ids } = table(["serranikson"]);
    addMinion(state, me, { attack: 1 });
    const weak = addMinion(state, foe, { attack: 3 });
    addMinion(state, foe, { attack: 4 });
    expect(new Set(playTargets(state, ids[0]!))).toEqual(new Set([minionRef(weak)]));
    const r = play(state, me, ids[0]!, { position: 1, target: minionRef(weak) }).state;
    expect(r.players[foe].board.map((m) => m.attack)).toEqual([4]);
  });

  it("Incatenato alla postazione: solo servitori nemici, e blocca", () => {
    const { state, me, foe, ids } = table(["incatenato-alla-postazione"]);
    addMinion(state, me);
    const enemyMinion = addMinion(state, foe);
    expect(playTargets(state, ids[0]!)).toEqual([minionRef(enemyMinion)]);
    const r = play(state, me, ids[0]!, { target: minionRef(enemyMinion) }).state;
    expect(r.players[foe].board[0]!.frozenTurns).toBe(1);
  });

  it("Il Ragno blocca un collega nemico per 2 turni", () => {
    const { state, me, foe, ids } = table(["il-ragno"]);
    const victim = addMinion(state, foe);
    const r = play(state, me, ids[0]!, { position: 0, target: minionRef(victim) }).state;
    expect(r.players[foe].board[0]!.frozenTurns).toBe(2);
  });

  it("Ciao Guido: solo propri colleghi; evoca una copia 1/1 alla sua destra, con le keyword base", () => {
    const { state, me, foe, ids } = table(["ciao-guido-sono-guido"]);
    const original = addMinion(state, me, { cardId: "il-crudo", attack: 9, health: 9, keywords: ["burocrazia", "scudato"] });
    addMinion(state, me, { cardId: "piccione-urbano" });
    addMinion(state, foe);
    expect(playTargets(state, ids[0]!)).toEqual([minionRef(original), minionRef(state.players[me].board[1]!)]);
    const r = play(state, me, ids[0]!, { target: minionRef(original) }).state;
    const board = r.players[me].board;
    expect(board.map((m) => m.cardId)).toEqual(["il-crudo", "il-crudo", "piccione-urbano"]);
    expect(board[1]).toMatchObject({ attack: 1, health: 1, maxHealth: 1, keywords: ["burocrazia"], summonedThisTurn: true });
  });

  it("i filtri valgono anche per i selettori non scelti", () => {
    const { state, me, foe } = table([]);
    const mine = addMinion(state, me, { attack: 1, health: 5 });
    const weakFoe = addMinion(state, foe, { attack: 1, health: 5 });
    const strongFoe = addMinion(state, foe, { attack: 4, health: 5 });
    const ctx: Ctx = { state: structuredClone(state), events: [] };
    runEffects(ctx, [{ trigger: "on_play", action: { kind: "damage", amount: 1, target: "all_minions", filter: { side: "enemy", maxAttack: 2 } } }], {
      player: me,
      cardId: "test",
    });
    const hit = ctx.events.flatMap((e) => (e.type === "damage" && e.target.kind === "minion" ? [e.target.instanceId] : []));
    expect(hit).toEqual([weakFoe.instanceId]);
    expect([mine, strongFoe]).toHaveLength(2);
  });
});

describe("all_other_friendly_minions", () => {
  it("Super Crudo dà +2/+2 agli altri propri colleghi, non a sé né ai nemici", () => {
    const { state, me, foe, ids } = table(["super-crudo"]);
    const friend = addMinion(state, me, { attack: 1, health: 1 });
    const enemyMinion = addMinion(state, foe, { attack: 1, health: 1 });
    const r = play(state, me, ids[0]!, { position: 1 }).state;
    const crudo = r.players[me].board.find((m) => m.cardId === "super-crudo")!;
    expect(crudo).toMatchObject({ attack: 7, health: 7 });
    expect(r.players[me].board.find((m) => m.instanceId === friend.instanceId)).toMatchObject({ attack: 3, health: 3 });
    expect(r.players[foe].board.find((m) => m.instanceId === enemyMinion.instanceId)).toMatchObject({ attack: 1, health: 1 });
  });

  it("Scudozord dà Scudato agli altri propri colleghi", () => {
    const { state, me, ids } = table(["scudozord"]);
    addMinion(state, me);
    const r = play(state, me, ids[0]!, { position: 1 }).state;
    expect(r.players[me].board.map((m) => m.keywords.includes("scudato"))).toEqual([true, false]);
  });
});

describe("lose_keyword", () => {
  it("La maledizione della tapparella blocca un nemico e gli toglie Burocrazia", () => {
    const { state, me, foe, ids } = table(["la-maledizione-della-tapparella"]);
    const taunt = addMinion(state, foe, { keywords: ["burocrazia"] });
    const { state: r, events } = play(state, me, ids[0]!, { target: minionRef(taunt) });
    expect(r.players[foe].board[0]).toMatchObject({ frozenTurns: 1, keywords: [] });
    expect(events).toContainEqual({ type: "keyword_lost", instanceId: taunt.instanceId, keyword: "burocrazia" });
  });
});

describe("take_control", () => {
  it("Lord Capognus prende un collega nemico con 2 o meno attacco, che non attacca subito", () => {
    const { state, me, foe, ids } = table(["lord-capognus"]);
    const weak = addMinion(state, foe, { attack: 2 });
    addMinion(state, foe, { attack: 3 });
    expect(playTargets(state, ids[0]!).filter(Boolean)).toEqual([minionRef(weak)]);
    const { state: r, events } = play(state, me, ids[0]!, { position: 0, target: minionRef(weak) });
    const stolen = r.players[me].board.find((m) => m.instanceId === weak.instanceId)!;
    expect(stolen).toMatchObject({ owner: foe, summonedThisTurn: true });
    expect(r.players[foe].board.some((m) => m.instanceId === weak.instanceId)).toBe(false);
    expect(events).toContainEqual({ type: "control_changed", instanceId: weak.instanceId, from: foe, to: me });
    expect(attackTargets(r, minionRef(stolen))).toEqual([]);
  });

  it("con la propria scrivania piena non ha effetto", () => {
    const { state, me, foe, ids } = table(["lord-capognus"]);
    fillBoard(state, me, rules.MAX_BOARD - 1);
    const weak = addMinion(state, foe, { attack: 1 });
    const r = play(state, me, ids[0]!, { position: 0, target: minionRef(weak) }).state;
    expect(r.players[foe].board.map((m) => m.instanceId)).toEqual([weak.instanceId]);
  });

  it("un servitore rubato non conta per Progetto Nettuno", () => {
    const { state, me, foe, ids } = table(["progetto-nettuno", "lord-capognus"]);
    const weak = addMinion(state, foe, { attack: 1 });
    let s = play(state, me, ids[0]!).state;
    s = play(s, me, ids[1]!, { position: 0, target: minionRef(weak) }).state;
    expect(s.players[me].task?.progress).toBe(1); // solo Lord Capognus
  });
});

describe("discover e choose", () => {
  it("Bozza a matita offre 3 Pratiche dell'Ufficio diverse, senza firme di altri eroi", () => {
    const { state, me, ids } = table(["bozza-a-matita"]);
    const { state: s, events } = play(state, me, ids[0]!);
    const choice = s.pendingChoice!;
    expect(choice.player).toBe(me);
    expect(choice.options).toHaveLength(3);
    expect(new Set(choice.options).size).toBe(3);
    const heroId = s.players[me].hero.heroId;
    for (const id of choice.options) {
      const def = CARDS_BY_ID.get(id)!;
      expect(def).toMatchObject({ type: "spell", faction: "ufficio" });
      expect(def.rarity).not.toBe("token");
      if (def.signatureOf) expect(def.signatureOf).toBe(heroId);
    }
    expect(events).toContainEqual({ type: "discover_offered", player: me, options: choice.options });
  });

  it("finché la scelta è in sospeso si può solo scegliere (o arrendersi)", () => {
    const { state, me, foe, ids } = table(["bozza-a-matita", "scorta-di-teresa"]);
    const s = play(state, me, ids[0]!).state;
    expect(getLegalActions(s, me)).toEqual([
      { type: "choose", player: me, index: 0 },
      { type: "choose", player: me, index: 1 },
      { type: "choose", player: me, index: 2 },
      { type: "concede", player: me },
    ]);
    expect(getLegalActions(s, foe)).toEqual([{ type: "concede", player: foe }]);
    expect(codeOf(s, { type: "end_turn", player: me })).toBe("pending_choice");
    expect(codeOf(s, { type: "choose", player: me, index: 3 })).toBe("invalid_choice");
  });

  it("choose mette in mano la carta scelta e chiude la scelta", () => {
    const { state, me, ids } = table(["bozza-a-matita"]);
    const s = play(state, me, ids[0]!).state;
    const picked = s.pendingChoice!.options[1]!;
    const { state: r, events } = applyAction(s, { type: "choose", player: me, index: 1 });
    expect(r.pendingChoice).toBeNull();
    expect(r.players[me].hand.at(-1)?.cardId).toBe(picked);
    expect(events).toContainEqual({ type: "card_chosen", player: me, cardId: picked });
  });

  it("senza scelta in sospeso choose non è valido", () => {
    const { state, me } = table([]);
    expect(codeOf(state, { type: "choose", player: me, index: 0 })).toBe("no_pending_choice");
  });

  it("è deterministico", () => {
    const a = table(["bozza-a-matita"]);
    const b = table(["bozza-a-matita"]);
    expect(play(a.state, a.me, a.ids[0]!).state.pendingChoice).toEqual(play(b.state, b.me, b.ids[0]!).state.pendingChoice);
  });
});

describe("cost_modifier", () => {
  it("Margherita: il prossimo Grappolaccio costa 3 in meno, poi lo sconto si consuma", () => {
    const { state, me, ids } = table(["margherita", "il-grappolaccio", "il-grappolaccio"]);
    const s = play(state, me, ids[0]!, { position: 0 }).state;
    const [g1, g2] = s.players[me].hand;
    expect(effectiveCost(s, me, g1!)).toBe(6);
    const after = play(s, me, g1!.instanceId, { position: 1 }).state;
    expect(effectiveCost(after, me, after.players[me].hand.find((c) => c.instanceId === g2!.instanceId)!)).toBe(9);
  });
});

describe("draw con costModifier", () => {
  it("Re Klaudio pesca 2 carte che costano 1 in meno", () => {
    const { state, me, ids } = table(["re-klaudio"]);
    const r = play(state, me, ids[0]!, { position: 0 }).state;
    expect(r.players[me].hand).toHaveLength(2);
    expect(r.players[me].hand.every((c) => c.costModifier === -1)).toBe(true);
  });
});

describe("on_damaged", () => {
  it("Collega furioso: quando subisce danni infligge 1 danno a tutti gli altri servitori", () => {
    const { state, me, foe } = table([]);
    const a = addMinion(state, me, { attack: 1, health: 9 });
    addMinion(state, foe, { cardId: "collega-furioso", attack: 1, health: 3 });
    const other1 = addMinion(state, foe, { health: 5 });
    const fury = state.players[foe].board[0]!;
    const r = attack(state, minionRef(a), minionRef(fury)).state;
    // a: 9 - 1 (contrattacco) - 1 (furia) = 7; other1: 5 - 1 = 4.
    expect(r.players[me].board[0]!.health).toBe(7);
    expect(r.players[foe].board.find((m) => m.instanceId === other1.instanceId)!.health).toBe(4);
  });

  it("non scatta se lo Scudato annulla il danno", () => {
    const { state, me, foe } = table([]);
    const a = addMinion(state, me, { attack: 1, health: 9 });
    const fury = addMinion(state, foe, { cardId: "collega-furioso", attack: 1, health: 3, keywords: ["scudato"] });
    const r = attack(state, minionRef(a), minionRef(fury)).state;
    expect(r.players[me].board[0]!.health).toBe(8); // solo il contrattacco
  });

  it("due Colleghi furiosi si colpiscono a vicenda finché uno muore, senza loop infiniti", () => {
    const { state, me, foe, ids } = table(["chiamata-api"]);
    addMinion(state, me, { cardId: "collega-furioso", attack: 1, health: 3 });
    const target = addMinion(state, foe, { cardId: "collega-furioso", attack: 1, health: 3 });
    const r = play(state, me, ids[0]!, { target: minionRef(target) });
    expect(r.state.phase).toBe("main");
    expect(r.state.players.p1.board.length + r.state.players.p2.board.length).toBeLessThan(2);
  });
});

describe("after_hero_attack ed extra_attack", () => {
  function armed(weapon: string) {
    const { state, me, foe, ids } = table([weapon]);
    return { state: play(state, me, ids[0]!).state, me, foe };
  }

  it("Scudo-bike: dopo che l'eroe attacca, 1 armatura", () => {
    const { state, me, foe } = armed("scudo-bike");
    const r = attack(state, heroRef(me), heroRef(foe)).state;
    expect(r.players[me].hero.armor).toBe(1);
  });

  it("Bici fiammante: dopo che l'eroe attacca, pesca una carta", () => {
    const { state, me, foe } = armed("bici-fiammante");
    const r = attack(state, heroRef(me), heroRef(foe)).state;
    expect(r.players[me].hand).toHaveLength(1);
  });

  it("Tatine-mobile: l'eroe attacca due volte per turno", () => {
    const { state, me, foe } = armed("tatine-mobile");
    const once = attack(state, heroRef(me), heroRef(foe)).state;
    expect(attackTargets(once, heroRef(me))).toContainEqual(heroRef(foe));
    const twice = attack(once, heroRef(me), heroRef(foe)).state;
    expect(attackTargets(twice, heroRef(me))).toEqual([]);
    expect(twice.players[foe].hero.health).toBe(rules.HERO_MAX_HEALTH - 6);
    const nextMine = endTurn(endTurn(twice).state).state;
    expect(attackTargets(nextMine, heroRef(me)).length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { applyAction } from "../src/apply";
import type { Ctx } from "../src/context";
import { CARDS_BY_ID } from "../src/data";
import { runEffects, type EffectSource } from "../src/effects";
import { getLegalActions } from "../src/legal";
import * as rules from "../src/rules";
import type { Action, CharacterRef, GameState, MinionInstance, PlayerId } from "../src/state";
import type { Effect, EffectAction } from "../src/types";
import { endTurn, fillBoard, other, startedGame, withHand } from "./helpers";

// ---------------------------------------------------------------------------------------------
// Banco di prova: turno 1, due servitori per lato con stats note.
// ---------------------------------------------------------------------------------------------

function bench() {
  const state = startedGame();
  const me = state.activePlayer;
  const foe = other(me);
  fillBoard(state, me, 2);
  fillBoard(state, foe, 2);
  const stats = (m: MinionInstance, atk: number, hp: number) => Object.assign(m, { attack: atk, health: hp, maxHealth: hp });
  const [m1, m2] = state.players[me].board.map((m, i) => stats(m, 2 + i, 4));
  const [f1, f2] = state.players[foe].board.map((m, i) => stats(m, 1 + i * 3, 3)); // 1/3 e 4/3
  return { state, me, foe, m1: m1!, m2: m2!, f1: f1!, f2: f2! };
}

const ctxOf = (state: GameState): Ctx => ({ state: structuredClone(state), events: [] });
const onPlay = (action: EffectAction): Effect => ({ trigger: "on_play", action });
const ref = (m: MinionInstance): CharacterRef => ({ kind: "minion", instanceId: m.instanceId });
const heroRef = (player: PlayerId): CharacterRef => ({ kind: "hero", player });

function run(state: GameState, actions: EffectAction[], source: Partial<EffectSource> & { player: PlayerId }) {
  const ctx = ctxOf(state);
  runEffects(ctx, actions.map(onPlay), { cardId: "test", ...source });
  return ctx;
}

const minionIn = (s: GameState, p: PlayerId, id: number) => s.players[p].board.find((m) => m.instanceId === id);

// ---------------------------------------------------------------------------------------------
// Un test per ogni kind del DSL
// ---------------------------------------------------------------------------------------------

describe("kind: damage", () => {
  it("colpisce tutti i bersagli del selettore insieme, poi la fase morti toglie i caduti", () => {
    const { state, me, foe, m1, f1, f2 } = bench();
    const { state: s, events } = run(state, [{ kind: "damage", amount: 3, target: "all_enemy_minions" }], { player: me });
    expect(s.players[foe].board).toEqual([]);
    expect(events.filter((e) => e.type === "damage")).toHaveLength(2);
    expect(events.filter((e) => e.type === "minion_died").map((e) => e.type === "minion_died" && e.instanceId)).toEqual([f1.instanceId, f2.instanceId]);
    expect(minionIn(s, me, m1.instanceId)?.health).toBe(4);
  });

  it("su un bersaglio scelto, anche un eroe", () => {
    const { state, me, foe } = bench();
    const { state: s } = run(state, [{ kind: "damage", amount: 2, target: "chosen" }], { player: me, target: heroRef(foe) });
    expect(s.players[foe].hero.health).toBe(rules.HERO_MAX_HEALTH - 2);
  });
});

describe("kind: heal", () => {
  it("cura fino al massimo, senza superarlo; evento con la cura effettiva", () => {
    const { state, me, m1 } = bench();
    state.players[me].hero.health = 27;
    m1.health = 1;
    const ctx = run(state, [{ kind: "heal", amount: 5, target: "friendly_hero" }, { kind: "heal", amount: 2, target: "chosen" }], { player: me, target: ref(m1) });
    expect(ctx.state.players[me].hero.health).toBe(rules.HERO_MAX_HEALTH);
    expect(minionIn(ctx.state, me, m1.instanceId)?.health).toBe(3);
    expect(ctx.events).toContainEqual({ type: "heal", target: heroRef(me), amount: 3 });
  });

  it("su un personaggio già al massimo non emette eventi", () => {
    const { state, me } = bench();
    expect(run(state, [{ kind: "heal", amount: 4, target: "friendly_hero" }], { player: me }).events).toEqual([]);
  });
});

describe("kind: armor", () => {
  it("dà armatura all'eroe di chi gioca", () => {
    const { state, me } = bench();
    const ctx = run(state, [{ kind: "armor", amount: 2 }], { player: me });
    expect(ctx.state.players[me].hero.armor).toBe(2);
    expect(ctx.events).toEqual([{ type: "armor_gained", player: me, amount: 2 }]);
  });
});

describe("kind: buff", () => {
  it("aumenta attacco, vita e vita massima dei servitori", () => {
    const { state, me, m1, m2 } = bench();
    const ctx = run(state, [{ kind: "buff", attack: 2, health: 1, target: "all_friendly_minions" }], { player: me });
    expect(minionIn(ctx.state, me, m1.instanceId)).toMatchObject({ attack: 4, health: 5, maxHealth: 5 });
    expect(minionIn(ctx.state, me, m2.instanceId)).toMatchObject({ attack: 5, health: 5, maxHealth: 5 });
    expect(ctx.events).toContainEqual({ type: "stats_changed", instanceId: m1.instanceId, attack: 4, health: 5 });
  });

  it("ignora gli eroi", () => {
    const { state, me } = bench();
    const ctx = run(state, [{ kind: "buff", attack: 1, health: 1, target: "friendly_hero" }], { player: me });
    expect(ctx.state.players[me].hero).toEqual(state.players[me].hero);
  });
});

describe("kind: give_keyword", () => {
  it("aggiunge la keyword una volta sola", () => {
    const { state, me, m1 } = bench();
    const ctx = run(state, [{ kind: "give_keyword", keyword: "scudato", target: "chosen" }, { kind: "give_keyword", keyword: "scudato", target: "chosen" }], {
      player: me,
      target: ref(m1),
    });
    expect(minionIn(ctx.state, me, m1.instanceId)?.keywords).toEqual(["scudato"]);
    expect(ctx.events).toEqual([{ type: "keyword_gained", instanceId: m1.instanceId, keyword: "scudato" }]);
  });
});

describe("kind: summon", () => {
  it("evoca a destra sul lato di chi gioca, o dell'avversario con forOpponent", () => {
    const { state, me, foe } = bench();
    const ctx = run(state, [{ kind: "summon", cardId: "studente-plagiato", count: 2 }, { kind: "summon", cardId: "spirito-zanzara", count: 1, forOpponent: true }], {
      player: me,
    });
    expect(ctx.state.players[me].board.map((m) => m.cardId).slice(-2)).toEqual(["studente-plagiato", "studente-plagiato"]);
    expect(ctx.state.players[foe].board.at(-1)?.cardId).toBe("spirito-zanzara");
  });

  it("evocati da un servitore: alla sua destra, nell'ordine", () => {
    const { state, me, m1, m2 } = bench();
    const ctx = run(state, [{ kind: "summon", cardId: "studente-plagiato", count: 2 }], { player: me, minion: m1.instanceId });
    const board = ctx.state.players[me].board;
    expect(board.map((m) => m.cardId)).toEqual([m1.cardId, "studente-plagiato", "studente-plagiato", m2.cardId]);
  });

  it("si ferma a scrivania piena", () => {
    const { state, me } = bench();
    fillBoard(state, me, rules.MAX_BOARD - 3); // 6 servitori
    const ctx = run(state, [{ kind: "summon", cardId: "operatore", count: 3 }], { player: me });
    expect(ctx.state.players[me].board).toHaveLength(rules.MAX_BOARD);
  });
});

describe("kind: draw", () => {
  it("pesca per chi gioca o per l'avversario", () => {
    const { state, me, foe } = bench();
    const ctx = run(state, [{ kind: "draw", count: 2 }, { kind: "draw", count: 1, forOpponent: true }], { player: me });
    expect(ctx.state.players[me].hand).toHaveLength(state.players[me].hand.length + 2);
    expect(ctx.state.players[foe].hand).toHaveLength(state.players[foe].hand.length + 1);
  });
});

describe("kind: add_to_hand", () => {
  it("genera carte nuove in mano con evento card_added", () => {
    const { state, me } = bench();
    const ctx = run(state, [{ kind: "add_to_hand", cardId: "sasso", count: 2 }], { player: me });
    const added = ctx.state.players[me].hand.slice(-2);
    expect(added.map((c) => c.cardId)).toEqual(["sasso", "sasso"]);
    expect(ctx.events.filter((e) => e.type === "card_added")).toHaveLength(2);
  });
});

describe("kind: destroy", () => {
  it("distrugge il bersaglio, anche se ha molta vita", () => {
    const { state, me, foe, f2 } = bench();
    f2.health = 99;
    const ctx = run(state, [{ kind: "destroy", target: "chosen" }], { player: me, target: ref(f2) });
    expect(minionIn(ctx.state, foe, f2.instanceId)).toBeUndefined();
    expect(ctx.state.players[foe].graveyard).toContain(f2.cardId);
  });

  it("con maxAttack risparmia i servitori più forti", () => {
    const { state, me, foe, f1, f2 } = bench(); // f1 1 attacco, f2 4 attacco
    const ctx = run(state, [{ kind: "destroy", target: "all_enemy_minions", maxAttack: 3 }], { player: me });
    expect(ctx.state.players[foe].board.map((m) => m.instanceId)).toEqual([f2.instanceId]);
    expect(f1).toBeDefined();
  });
});

describe("kind: return_to_hand", () => {
  it("rimanda in mano al proprietario come carta base con id nuovo", () => {
    const { state, me, foe, f1 } = bench();
    f1.attack = 9;
    const ctx = run(state, [{ kind: "return_to_hand", target: "chosen" }], { player: me, target: ref(f1) });
    const s = ctx.state;
    expect(minionIn(s, foe, f1.instanceId)).toBeUndefined();
    const card = s.players[foe].hand.at(-1)!;
    expect(card).toMatchObject({ cardId: f1.cardId, costModifier: 0 });
    expect(card.instanceId).not.toBe(f1.instanceId);
    expect(ctx.events).toContainEqual({ type: "returned_to_hand", player: foe, instanceId: f1.instanceId, cardId: f1.cardId });
    expect(s.players[foe].graveyard).toEqual([]); // non è una morte
  });

  it("a mano piena il servitore viene rimosso e la carta scartata", () => {
    const { state, me, foe, f1 } = bench();
    const p = state.players[foe];
    while (p.hand.length < rules.MAX_HAND) p.hand.push({ instanceId: state.nextInstanceId++, cardId: "sasso", costModifier: 0 });
    const ctx = run(state, [{ kind: "return_to_hand", target: "chosen" }], { player: me, target: ref(f1) });
    expect(minionIn(ctx.state, foe, f1.instanceId)).toBeUndefined();
    expect(ctx.state.players[foe].hand).toHaveLength(rules.MAX_HAND);
    expect(ctx.events).toContainEqual({ type: "card_burned", player: foe, cardId: f1.cardId });
  });
});

describe("kind: freeze", () => {
  it("blocca per N turni ricordando il turno; un nuovo blocco tiene il più lungo", () => {
    const { state, me, foe, f1 } = bench();
    const ctx = run(state, [{ kind: "freeze", target: "chosen", turns: 2 }, { kind: "freeze", target: "chosen", turns: 1 }], { player: me, target: ref(f1) });
    expect(minionIn(ctx.state, foe, f1.instanceId)).toMatchObject({ frozenTurns: 2, frozenOnTurn: state.turn });
    expect(ctx.events.filter((e) => e.type === "frozen")).toHaveLength(2);
  });
});

describe("kind: gain_mana", () => {
  it("temporaneo: solo caffettini disponibili, fino a 10", () => {
    const { state, me } = bench();
    state.players[me].mana = { max: 3, available: 1 };
    expect(run(state, [{ kind: "gain_mana", amount: 1, temporary: true }], { player: me }).state.players[me].mana).toEqual({ max: 3, available: 2 });
    state.players[me].mana = { max: 10, available: 10 };
    expect(run(state, [{ kind: "gain_mana", amount: 1, temporary: true }], { player: me }).state.players[me].mana).toEqual({ max: 10, available: 10 });
  });

  it("permanente: anche i caffettini massimi, fino a 10", () => {
    const { state, me } = bench();
    state.players[me].mana = { max: 9, available: 2 };
    expect(run(state, [{ kind: "gain_mana", amount: 2, temporary: false }], { player: me }).state.players[me].mana).toEqual({ max: 10, available: 4 });
  });
});

describe("kind: custom", () => {
  it("un handler sconosciuto è un errore di dati, non un'azione illegale", () => {
    const { state, me } = bench();
    expect(() => run(state, [{ kind: "custom", handler: "non-esiste" }], { player: me })).toThrow(/non-esiste/);
  });
});

// ---------------------------------------------------------------------------------------------
// Selettori
// ---------------------------------------------------------------------------------------------

describe("selettori", () => {
  it("self, all_other_minions e all_minions sono relativi al servitore sorgente", () => {
    const { state, me, foe, m1 } = bench();
    const ctx = run(state, [{ kind: "buff", attack: 1, health: 0, target: "all_other_minions" }], { player: me, minion: m1.instanceId });
    expect(minionIn(ctx.state, me, m1.instanceId)?.attack).toBe(m1.attack);
    expect(ctx.state.players[foe].board.every((m, i) => m.attack === state.players[foe].board[i]!.attack + 1)).toBe(true);

    const selfCtx = run(state, [{ kind: "buff", attack: 1, health: 0, target: "self" }], { player: me, minion: m1.instanceId });
    expect(minionIn(selfCtx.state, me, m1.instanceId)?.attack).toBe(m1.attack + 1);

    const all = run(state, [{ kind: "damage", amount: 1, target: "all_minions" }], { player: me });
    expect(all.events.filter((e) => e.type === "damage")).toHaveLength(4);
  });

  it("random_enemy_minion usa l'RNG della partita: deterministico, e avanza il seed", () => {
    const { state, me } = bench();
    const a = run(state, [{ kind: "damage", amount: 1, target: "random_enemy_minion" }], { player: me });
    const b = run(state, [{ kind: "damage", amount: 1, target: "random_enemy_minion" }], { player: me });
    expect(a.events).toEqual(b.events);
    expect(a.events.filter((e) => e.type === "damage")).toHaveLength(1);
    expect(a.state.rng).not.toBe(state.rng);
  });

  it("random_enemy_minion senza servitori nemici non fa nulla", () => {
    const { state, me, foe } = bench();
    state.players[foe].board = [];
    expect(run(state, [{ kind: "damage", amount: 1, target: "random_enemy_minion" }], { player: me }).events).toEqual([]);
  });

  it("un bersaglio scelto che non esiste più viene saltato", () => {
    const { state, me, f1 } = bench();
    const ctx = run(state, [{ kind: "destroy", target: "chosen" }, { kind: "buff", attack: 5, health: 5, target: "chosen" }], { player: me, target: ref(f1) });
    expect(ctx.events.some((e) => e.type === "stats_changed")).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Integrazione con carte vere: bersagli legali e trigger
// ---------------------------------------------------------------------------------------------

const playActions = (state: GameState, player: PlayerId, card: number) =>
  getLegalActions(state, player).filter((a): a is Extract<Action, { type: "play_card" }> => a.type === "play_card" && a.card === card);

describe("carte con bersaglio scelto", () => {
  it("Chiamata API può colpire ogni personaggio: servitori ed eroi di entrambi", () => {
    const { state, me, foe, m1, m2, f1, f2 } = bench();
    const { state: s, ids } = withHand(state, me, ["chiamata-api"]);
    expect(playActions(s, me, ids[0]!).map((a) => a.target)).toEqual([ref(m1), ref(m2), heroRef(me), ref(f1), ref(f2), heroRef(foe)]);
    const r = applyAction(s, { type: "play_card", player: me, card: ids[0]!, target: heroRef(foe) });
    expect(r.state.players[foe].hero.health).toBe(rules.HERO_MAX_HEALTH - 2);
    expect(r.events[0]).toEqual({ type: "card_played", player: me, instanceId: ids[0], cardId: "chiamata-api", target: heroRef(foe) });
  });

  it("Sasso bersaglia solo servitori; senza servitori non si gioca", () => {
    const { state, me } = bench();
    const { state: s, ids } = withHand(state, me, ["sasso"]);
    expect(playActions(s, me, ids[0]!).every((a) => a.target?.kind === "minion")).toBe(true);
    s.players.p1.board = [];
    s.players.p2.board = [];
    expect(playActions(s, me, ids[0]!)).toEqual([]);
  });

  it("L'ultimo sorso bersaglia solo servitori con 3 o meno attacco", () => {
    const { state, me, m1, m2, f1 } = bench(); // m1 2, m2 3, f1 1, f2 4
    const { state: s, ids } = withHand(state, me, ["l-ultimo-sorso"]);
    expect(playActions(s, me, ids[0]!).map((a) => a.target)).toEqual([ref(m1), ref(m2), ref(f1)]);
  });

  it("senza bersaglio, con un bersaglio non valido o a una carta che non lo vuole: invalid_target", () => {
    const { state, me, foe } = bench();
    const { state: s, ids } = withHand(state, me, ["chiamata-api", "il-cursore", "sasso"]);
    const code = (a: Action) => {
      try {
        applyAction(s, a);
        return "accepted";
      } catch (e) {
        return (e as { code: string }).code;
      }
    };
    expect(code({ type: "play_card", player: me, card: ids[0]! })).toBe("invalid_target");
    expect(code({ type: "play_card", player: me, card: ids[2]!, target: heroRef(foe) })).toBe("invalid_target");
    expect(code({ type: "play_card", player: me, card: ids[1]!, position: 0, target: heroRef(foe) })).toBe("invalid_target");
  });

  it("Emergenza ritardi applica entrambi gli effetti allo stesso collega", () => {
    const { state, me, m1 } = bench();
    const { state: s, ids } = withHand(state, me, ["emergenza-ritardi"]);
    const r = applyAction(s, { type: "play_card", player: me, card: ids[0]!, target: ref(m1) });
    expect(minionIn(r.state, me, m1.instanceId)).toMatchObject({ attack: m1.attack + 1, keywords: ["urgente"] });
  });
});

describe("Deploy e Pratiche senza bersaglio", () => {
  it("Il Cursore pesca una carta quando viene giocato", () => {
    const { state, me } = bench();
    const { state: s, ids } = withHand(state, me, ["il-cursore"]);
    const r = applyAction(s, { type: "play_card", player: me, card: ids[0]!, position: 0 });
    expect(r.state.players[me].hand).toHaveLength(1);
    const types = r.events.map((e) => e.type);
    expect(types.indexOf("minion_summoned")).toBeLessThan(types.indexOf("card_drawn")); // prima entra, poi Deploy
  });

  it("Sociozilla colpisce tutti gli altri servitori ma non sé stesso", () => {
    const { state, me, foe } = bench();
    const { state: s, ids } = withHand(state, me, ["sociozilla"]);
    const r = applyAction(s, { type: "play_card", player: me, card: ids[0]!, position: 2 });
    const zilla = r.state.players[me].board.find((m) => m.cardId === "sociozilla")!;
    expect(zilla.health).toBe(CARDS_BY_ID.get("sociozilla")!.health);
    expect(r.state.players[foe].board.every((m) => m.health === 1)).toBe(true);
  });

  it("Dr Grappolo evoca due Studenti alla sua destra", () => {
    const { state, me } = bench();
    const { state: s, ids } = withHand(state, me, ["dr-grappolo"]);
    const r = applyAction(s, { type: "play_card", player: me, card: ids[0]!, position: 0 });
    expect(r.state.players[me].board.map((m) => m.cardId)).toEqual(["dr-grappolo", "studente-plagiato", "studente-plagiato", "il-crudo", "il-crudo"]);
  });

  it("il Caffettino dà 1 caffettino per questo turno", () => {
    const { state, me } = bench();
    const { state: s, ids } = withHand(state, me, [rules.COIN_CARD_ID], 1);
    const r = applyAction(s, { type: "play_card", player: me, card: ids[0]! });
    expect(r.state.players[me].mana).toEqual({ max: 1, available: 2 });
  });

  it("Scoppio d'ira: le morti arrivano dopo tutti i danni", () => {
    const { state, me, f1 } = bench();
    f1.health = 2; // muore con 2 danni
    const { state: s, ids } = withHand(state, me, ["scoppio-d-ira"]);
    const r = applyAction(s, { type: "play_card", player: me, card: ids[0]! });
    const types = r.events.map((e) => e.type);
    expect(types.lastIndexOf("damage")).toBeLessThan(types.indexOf("minion_died"));
  });
});

describe("trigger di inizio e fine turno", () => {
  it("Zanzagallo infligge 1 danno ai servitori nemici alla fine del turno del suo controllore", () => {
    const { state, me, foe } = bench();
    fillBoard(state, me, 1, "zanzagallo");
    const r = endTurn(state);
    expect(r.state.players[foe].board.map((m) => m.health)).toEqual([2, 2]);
    // Non scatta alla fine del turno dell'avversario.
    const after = endTurn(r.state).state;
    expect(after.players[foe].board.map((m) => m.health)).toEqual([2, 2]);
  });

  it("Il Calabrone evoca una Zanzarina all'inizio del turno del suo controllore", () => {
    const { state, me } = bench();
    fillBoard(state, me, 1, "il-calabrone");
    const theirTurn = endTurn(state).state;
    expect(theirTurn.players[me].board.some((m) => m.cardId === "zanzarina")).toBe(false);
    const myTurn = endTurn(theirTurn).state;
    expect(myTurn.players[me].board.at(-1)?.cardId).toBe("zanzarina");
  });
});

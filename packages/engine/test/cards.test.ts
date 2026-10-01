// Un test di integrazione per ogni carta con testo (T1.15): giocata (o trigger) → stato atteso.
import { describe, expect, it } from "vitest";
import { applyAction } from "../src/apply";
import { CARDS } from "../src/data";
import * as rules from "../src/rules";
import type { Action, GameState, MinionInstance, PlayerId } from "../src/state";
import { addMinion, endTurn, heroRef, minionRef, other, startedGame, withHand } from "./helpers";
import { attack } from "./keywords/kw";

interface T {
  s: GameState;
  me: PlayerId;
  foe: PlayerId;
  /** instanceId della carta in prova, in mano. */
  card: number;
  /** Gioca la carta in prova. Servitori: in fondo a destra salvo `position`. */
  play: (extra?: Partial<Extract<Action, { type: "play_card" }>>) => GameState;
  mine: (fields?: Partial<MinionInstance>) => MinionInstance;
  theirs: (fields?: Partial<MinionInstance>) => MinionInstance;
}

function setup(cardId: string): T {
  const s0 = startedGame();
  const me = s0.activePlayer;
  const foe = other(me);
  const { state: s, ids } = withHand(s0, me, [cardId]);
  s.players[me].mana.available = 30;
  s.players[me].hero.health = 20; // spazio per cure
  const card = ids[0]!;
  const t: T = {
    s,
    me,
    foe,
    card,
    play: (extra = {}) => {
      const isMinion = CARDS.find((c) => c.id === cardId)!.type === "minion";
      return applyAction(t.s, { type: "play_card", player: me, card, ...(isMinion ? { position: t.s.players[me].board.length } : {}), ...extra }).state;
    },
    mine: (fields) => addMinion(t.s, me, fields),
    theirs: (fields) => addMinion(t.s, foe, fields),
  };
  return t;
}

const find = (s: GameState, id: number) => [...s.players.p1.board, ...s.players.p2.board].find((m) => m.instanceId === id);
const played = (s: GameState, p: PlayerId, cardId: string) => s.players[p].board.find((m) => m.cardId === cardId)!;

const SCENARIOS: Record<string, (t: T) => void> = {
  "scudo-dell-ultimo-momento": (t) => {
    const m = t.mine();
    const r = t.play({ target: minionRef(m) });
    expect(find(r, m.instanceId)!.keywords).toContain("scudato");
    expect(r.players[t.me].hand).toHaveLength(1);
  },
  "scudo-bike": (t) => {
    const r = attack(t.play(), heroRef(t.me), heroRef(t.foe)).state;
    expect(r.players[t.me].hero.armor).toBe(1);
  },
  scudozord: (t) => {
    const m = t.mine();
    const r = t.play();
    expect(find(r, m.instanceId)!.keywords).toContain("scudato");
    expect(played(r, t.me, "scudozord").keywords).not.toContain("scudato");
  },
  sasso: (t) => {
    const m = t.mine({ attack: 2, health: 3 });
    expect(find(t.play({ target: minionRef(m) }), m.instanceId)).toMatchObject({ attack: 3, health: 4 });
  },
  "uomo-sasso": (t) => {
    t.s.players[t.me].played = ["sasso", "sasso"];
    expect(played(t.play(), t.me, "uomo-sasso")).toMatchObject({ attack: 6, health: 7 }); // 4/5 + 2 Sassi
  },
  serranikson: (t) => {
    const weak = t.theirs({ attack: 3 });
    expect(find(t.play({ target: minionRef(weak) }), weak.instanceId)).toBeUndefined();
  },
  "scoppio-d-ira": (t) => {
    const a = t.mine({ health: 5 });
    const b = t.theirs({ health: 2 });
    const r = t.play();
    expect(find(r, a.instanceId)!.health).toBe(3);
    expect(find(r, b.instanceId)).toBeUndefined();
  },
  "collega-furioso": (t) => {
    const other1 = t.theirs({ health: 5 });
    const r = t.play();
    const fury = played(r, t.me, "collega-furioso");
    fury.summonedThisTurn = false;
    const attacker = addMinion(r, t.foe, { attack: 1, health: 9 });
    const after = endTurn(r).state;
    const hit = attack(after, minionRef(attacker), minionRef(fury)).state;
    expect(find(hit, other1.instanceId)!.health).toBe(4);
  },
  "sushi-di-fiducia": (t) => {
    const r = t.play();
    expect(r.players[t.me].hero.health).toBe(24);
    expect(r.players[t.me].hand).toHaveLength(1);
  },
  miletta: (t) => {
    const r = t.play();
    const m = played(r, t.me, "miletta");
    m.health = 1;
    const killer = addMinion(r, t.foe, { attack: 5, health: 9 });
    const theirTurn = endTurn(r).state;
    const after = attack(theirTurn, minionRef(killer), minionRef(m)).state;
    expect(after.players[t.foe].board.map((x) => x.cardId)).toContain("spirito-zanzara");
  },
  "incatenato-alla-postazione": (t) => {
    const m = t.theirs();
    expect(find(t.play({ target: minionRef(m) }), m.instanceId)!.frozenTurns).toBe(1);
  },
  klaudioken: (t) => {
    expect(t.play({ target: heroRef(t.foe) }).players[t.foe].hero.health).toBe(rules.HERO_MAX_HEALTH - 4);
  },
  "re-klaudio": (t) => {
    const r = t.play();
    expect(r.players[t.me].hand.map((c) => c.costModifier)).toEqual([-1, -1]);
  },
  "portinaio-dell-aldila": (t) => {
    t.s.players[t.me].graveyard = ["il-crudo"];
    const r = t.play();
    const p = played(r, t.me, "portinaio-dell-aldila");
    p.health = 1;
    const killer = addMinion(r, t.foe, { attack: 5, health: 9 });
    const after = attack(endTurn(r).state, minionRef(killer), minionRef(p)).state;
    expect(after.players[t.me].hand.map((c) => c.cardId)).toContain("il-crudo");
  },
  "bozza-a-matita": (t) => {
    const r = t.play();
    expect(r.pendingChoice?.options).toHaveLength(3);
  },
  retcon: (t) => {
    t.mine({ cardId: "il-crudo" });
    t.theirs({ cardId: "miletta" });
    const r = t.play();
    expect(r.players[t.me].board).toEqual([]);
    expect(r.players[t.foe].board).toEqual([]);
    expect(r.players[t.me].hand.map((c) => c.cardId)).toEqual(["il-crudo"]);
    expect(r.players[t.foe].hand.map((c) => c.cardId)).toContain("miletta");
  },
  "la-lore-dell-ufficio": (t) => {
    expect(t.play().players[t.me].board).toHaveLength(3);
  },
  "super-crudo": (t) => {
    const m = t.mine({ attack: 1, health: 1 });
    expect(find(t.play(), m.instanceId)).toMatchObject({ attack: 3, health: 3 });
  },
  "scorta-di-teresa": (t) => {
    expect(t.play().players[t.me].hero.health).toBe(23);
  },
  "tatine-mobile": (t) => {
    let r = t.play();
    r = attack(r, heroRef(t.me), heroRef(t.foe)).state;
    r = attack(r, heroRef(t.me), heroRef(t.foe)).state;
    expect(r.players[t.foe].hero.health).toBe(rules.HERO_MAX_HEALTH - 6);
  },
  "emergenza-ritardi": (t) => {
    const m = t.mine({ attack: 2 });
    expect(find(t.play({ target: minionRef(m) }), m.instanceId)).toMatchObject({ attack: 3, keywords: ["urgente"] });
  },
  "ciao-guido-sono-guido": (t) => {
    const m = t.mine({ cardId: "zanzagallo", attack: 5, health: 5 });
    const r = t.play({ target: minionRef(m) });
    expect(r.players[t.me].board.map((x) => [x.cardId, x.attack, x.health])).toEqual([
      ["zanzagallo", 5, 5],
      ["zanzagallo", 1, 1],
    ]);
  },
  "il-cursore": (t) => {
    expect(t.play().players[t.me].hand).toHaveLength(1);
  },
  "le-task": (t) => {
    expect(t.play().players[t.me].task).toEqual({ cardId: "le-task", progress: 0, goal: 5 });
  },
  "il-cannellone": (t) => {
    const r = t.play();
    const c = played(r, t.me, "il-cannellone");
    c.health = 1;
    const killer = addMinion(r, t.foe, { attack: 5, health: 9 });
    const theirTurn = endTurn(r).state;
    const handBefore = theirTurn.players[t.me].hand.length;
    const after = attack(theirTurn, minionRef(killer), minionRef(c)).state;
    expect(after.players[t.me].hand).toHaveLength(handBefore + 1);
  },
  "bici-fiammante": (t) => {
    const r = attack(t.play(), heroRef(t.me), heroRef(t.foe)).state;
    expect(r.players[t.me].hand).toHaveLength(1);
  },
  "il-ragno": (t) => {
    const m = t.theirs();
    expect(find(t.play({ target: minionRef(m) }), m.instanceId)!.frozenTurns).toBe(2);
  },
  "il-calabrone": (t) => {
    const r = endTurn(endTurn(t.play()).state).state;
    expect(r.players[t.me].board.map((m) => m.cardId)).toEqual(["il-calabrone", "zanzarina"]);
  },
  "dr-grappolo": (t) => {
    expect(t.play().players[t.me].board.map((m) => m.cardId)).toEqual(["dr-grappolo", "studente-plagiato", "studente-plagiato"]);
  },
  "il-grappolaccio": (t) => {
    const a = t.mine({ health: 5 });
    const b = t.theirs({ health: 5 });
    const r = t.play();
    expect([find(r, a.instanceId)!.health, find(r, b.instanceId)!.health]).toEqual([5, 3]);
  },
  sociozilla: (t) => {
    const a = t.mine({ health: 5 });
    const r = t.play();
    expect(find(r, a.instanceId)!.health).toBe(3);
    expect(played(r, t.me, "sociozilla").health).toBe(played(r, t.me, "sociozilla").maxHealth);
  },
  margherita: (t) => {
    expect(t.play().players[t.me].costModifiers).toEqual([{ filter: { cardId: "il-grappolaccio" }, amount: -3, expiresEndOfTurn: false }]);
  },
  "lord-capognus": (t) => {
    const weak = t.theirs({ attack: 2 });
    const r = t.play({ target: minionRef(weak) });
    expect(r.players[t.me].board.some((m) => m.instanceId === weak.instanceId)).toBe(true);
  },
  zanzagallo: (t) => {
    const b = t.theirs({ health: 5 });
    const r = endTurn(t.play()).state;
    expect(find(r, b.instanceId)!.health).toBe(4);
  },
  "la-canalis": (t) => {
    const r = t.play();
    const c = played(r, t.me, "la-canalis");
    c.health = 1;
    const killer = addMinion(r, t.foe, { attack: 5, health: 9 });
    const after = attack(endTurn(r).state, minionRef(killer), minionRef(c)).state;
    expect(after.players[t.foe].hero.health).toBe(rules.HERO_MAX_HEALTH - 2);
  },
  "sermig-reparto-sfruttamento": (t) => {
    const m = t.mine({ attack: 1, health: 3 });
    expect(find(t.play(), m.instanceId)).toMatchObject({ attack: 3, health: 2 });
  },
  "troiaio-comunicazioni": (t) => {
    const foeHand = t.s.players[t.foe].hand.length;
    const r = t.play();
    expect(r.players[t.me].hand).toHaveLength(2);
    expect(r.players[t.foe].hand).toHaveLength(foeHand + 1);
  },
  "assedio-dei-call-center": (t) => {
    const r = t.play();
    expect(r.players[t.me].board.map((m) => [m.cardId, m.keywords])).toEqual(Array(3).fill(["operatore", ["burocrazia"]]));
  },
  "la-maledizione-della-tapparella": (t) => {
    const m = t.theirs({ keywords: ["burocrazia"] });
    expect(find(t.play({ target: minionRef(m) }), m.instanceId)).toMatchObject({ frozenTurns: 1, keywords: [] });
  },
  "progetto-nettuno": (t) => {
    expect(t.play().players[t.me].task).toEqual({ cardId: "progetto-nettuno", progress: 0, goal: 6 });
  },
  "riunione-infinita": (t) => {
    const a = t.theirs();
    const b = t.theirs();
    const r = t.play();
    expect([find(r, a.instanceId)!.frozenTurns, find(r, b.instanceId)!.frozenTurns]).toEqual([1, 1]);
  },
  "i-dogmi-del-calabrone": (t) => {
    const r = t.play();
    expect(r.players[t.foe].hero.health).toBe(rules.HERO_MAX_HEALTH - 2);
    expect(r.players[t.me].hand).toHaveLength(1);
  },
  caffettino: (t) => {
    t.s.players[t.me].mana = { max: 3, available: 0 };
    expect(t.play().players[t.me].mana).toEqual({ max: 3, available: 1 });
  },
  "chiamata-api": (t) => {
    const m = t.theirs({ health: 5 });
    expect(find(t.play({ target: minionRef(m) }), m.instanceId)!.health).toBe(3);
  },
  "mezza-giornata": (t) => {
    const m = t.theirs({ cardId: "zanzagallo" });
    const r = t.play({ target: minionRef(m) });
    expect(r.players[t.foe].board).toEqual([]);
    expect(r.players[t.foe].hand.at(-1)?.cardId).toBe("zanzagallo");
  },
  "l-ultimo-sorso": (t) => {
    const m = t.theirs({ attack: 3, health: 99 });
    expect(find(t.play({ target: minionRef(m) }), m.instanceId)).toBeUndefined();
  },
  "pinguino-glaciale": (t) => {
    const m = t.theirs();
    expect(find(t.play({ target: minionRef(m) }), m.instanceId)!.frozenTurns).toBe(1);
  },
  "uomo-rana": (t) => {
    const a = t.mine({ health: 5 });
    const b = t.theirs({ health: 5 });
    const r = t.play();
    expect([find(r, a.instanceId)!.health, find(r, b.instanceId)!.health]).toEqual([4, 4]);
    expect(played(r, t.me, "uomo-rana").health).toBe(5);
  },
};

describe("dati delle carte", () => {
  it("ogni carta con testo ha effetti o una Task", () => {
    for (const c of CARDS.filter((c) => c.text)) expect(c.effects.length > 0 || !!c.task, c.id).toBe(true);
  });

  it("ogni carta con testo ha uno scenario di integrazione", () => {
    const withText = CARDS.filter((c) => c.text).map((c) => c.id).sort();
    expect(Object.keys(SCENARIOS).sort()).toEqual(withText);
  });
});

describe("integrazione per carta", () => {
  it.each(Object.keys(SCENARIOS))("%s", (cardId) => {
    SCENARIOS[cardId]!(setup(cardId));
  });
});

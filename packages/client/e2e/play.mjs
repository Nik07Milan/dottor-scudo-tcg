// Prova end-to-end: due giocatori giocano 10 turni con trascinamenti, Pratiche con bersaglio e attacchi.
import { L, OUT, ds, finish, handX, minionX, openBrowser, startMatch } from "./common.mjs";

const errors = [];
const log = [];
const browser = await openBrowser();
const { p1, p2 } = await startMatch(browser, errors);
const settle = (page, ms = 1300) => page.waitForTimeout(ms);
let dragged = 0, spellsOnHero = 0, attacks = 0;

for (let t = 0; t < 10; t++) {
  const m1 = await ds(p1, "model");
  if (m1.result) break;
  const page = m1.myTurn ? p1 : p2;
  const who = m1.myTurn ? "p1" : "p2";
  let m = await ds(page, "model");

  // Un servitore giocabile: trascinato sulla scrivania; se ha un Deploy con bersaglio si clicca un nemico.
  const mi = m.me.hand.findIndex((c) => c.playable && c.type === "minion");
  if (mi >= 0) {
    await page.mouse.move(handX(mi, m.me.hand.length), L.handClickY);
    await page.mouse.down();
    await page.mouse.move(L.boardX, 560, { steps: 6 });
    await page.mouse.move(L.boardX + 300, L.myBoard, { steps: 6 });
    await page.mouse.up();
    await settle(page, 500);
    if ((await ds(page, "selection"))?.kind === "card") {
      const hl = await ds(page, "highlights");
      const fm = (await ds(page, "model")).foe.board;
      const ti = fm.findIndex((x) => hl.minions.includes(x.instanceId));
      await page.mouse.click(ti >= 0 ? minionX(ti, fm.length) : 10, ti >= 0 ? L.foeBoard : 10);
    }
    await settle(page);
    const after = await ds(page, "model");
    if (after.me.board.length > m.me.board.length || after.me.hand.length < m.me.hand.length) dragged++;
    log.push(`${who} trascina ${m.me.hand[mi].name}`);
    m = after;
  }

  // Una Pratica di danni: clic sulla carta, poi sull'eroe nemico.
  const si = m.me.hand.findIndex((c) => c.playable && c.type === "spell" && /^Infliggi \d+ danni$/.test(c.text));
  if (si >= 0) {
    // Il danno passa prima dall'armatura: si misurano ferie + armatura.
    const life = (model) => model.foe.hero.health + model.foe.hero.armor;
    const before = life(m);
    await page.mouse.click(handX(si, m.me.hand.length), L.handClickY);
    await settle(page, 300);
    await page.mouse.click(L.foeHero.x, L.foeHero.y);
    await settle(page);
    const after = await ds(page, "model");
    if (life(after) < before) spellsOnHero++;
    else errors.push(`${who}: ${m.me.hand[si].name} sull'eroe non ha fatto danni (selezione ${JSON.stringify(await ds(page, "selection"))})`);
    log.push(`${who} gioca ${m.me.hand[si].name} sull'eroe: ${before}→${life(after)}`);
    m = after;
  }

  // Attacchi finché ci sono attaccanti: l'eroe nemico se attaccabile, altrimenti un servitore evidenziato
  // (Burocrazia, o Urgente appena giocato che può colpire solo servitori).
  for (let k = 0; k < 7; k++) {
    m = await ds(page, "model");
    const ai = m.me.board.findIndex((x) => x.canAttack);
    if (ai < 0 || m.result) break;
    await page.mouse.click(minionX(ai, m.me.board.length), L.myBoard);
    await settle(page, 300);
    const hl = await ds(page, "highlights");
    const fm = m.foe.board;
    const ti = fm.findIndex((x) => hl.minions.includes(x.instanceId));
    if (hl.heroes.length) await page.mouse.click(L.foeHero.x, L.foeHero.y);
    else if (ti >= 0) await page.mouse.click(minionX(ti, fm.length), L.foeBoard);
    else {
      await page.mouse.click(10, 10);
      break;
    }
    await settle(page);
    const after = await ds(page, "model");
    if (after.me.board.length !== m.me.board.length || !after.me.board[ai]?.canAttack) attacks++;
    else errors.push(`${who}: l'attacco con ${m.me.board[ai].name} non è partito`);
  }

  if (t === 3) {
    await p1.screenshot({ path: `${OUT}/partita-p1.png` });
    await p2.screenshot({ path: `${OUT}/partita-p2.png` });
  }
  if ((await ds(page, "model")).result) break;
  await page.mouse.click(L.endTurn.x, L.endTurn.y);
  await settle(page, 1800);
}

const f1 = await ds(p1, "model");
const f2 = await ds(p2, "model");
await p1.screenshot({ path: `${OUT}/finale-p1.png` });
const consistent = f1.me.hero.health === f2.foe.hero.health && f1.foe.hero.health === f2.me.hero.health;
finish({ ok: consistent && dragged > 0 && attacks > 0, turn: f1.turn, dragged, spellsOnHero, attacks, consistent, log }, errors);
await browser.close();

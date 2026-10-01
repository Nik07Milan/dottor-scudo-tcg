// Prova end-to-end: partita contro l'IA nel browser (senza server). Basta `npm run dev:client`.
import { L, OUT, ds, finish, handX, minionX, openBrowser, player, waitFor } from "./common.mjs";

const errors = [];
const browser = await openBrowser();
const page = await player(browser, "umano", errors);
await page.mouse.click(L.lobby.jackson.x, L.lobby.jackson.y);
await page.mouse.click(640, 625); // Contro l'IA · Normale
await waitFor(page, "model");
await page.waitForTimeout(1500); // il bot fa il suo mulligan
await page.mouse.click(L.mulliganKeep.x, L.mulliganKeep.y);
await page.waitForTimeout(2000);

/** Aspetta che sia di nuovo il turno dell'umano (o che la partita finisca). */
async function waitMyTurn() {
  for (let i = 0; i < 200; i++) {
    const m = await ds(page, "model");
    if (m?.result || (m?.myTurn && !(await ds(page, "inFlight")))) return m;
    await page.waitForTimeout(150);
  }
  throw new Error("il bot non ha restituito il turno");
}

let botTurns = 0;
let maxFoeBoard = 0;
for (let t = 0; t < 6; t++) {
  let m = await waitMyTurn();
  if (m.result) break;
  const mi = m.me.hand.findIndex((c) => c.playable && c.type === "minion");
  if (mi >= 0) {
    await page.mouse.move(handX(mi, m.me.hand.length), L.handClickY);
    await page.mouse.down();
    await page.mouse.move(L.boardX + 300, L.myBoard, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    if ((await ds(page, "selection"))?.kind === "card") await page.mouse.click(10, 10);
    await page.waitForTimeout(800);
  }
  m = await ds(page, "model");
  const ai = m.me.board.findIndex((x) => x.canAttack);
  if (ai >= 0) {
    await page.mouse.click(minionX(ai, m.me.board.length), L.myBoard);
    await page.waitForTimeout(300);
    const hl = await ds(page, "highlights");
    if (hl.heroes.length) await page.mouse.click(L.foeHero.x, L.foeHero.y);
    else await page.mouse.click(10, 10);
    await page.waitForTimeout(900);
  }
  const turnBefore = (await ds(page, "model")).turn;
  await page.mouse.click(L.endTurn.x, L.endTurn.y);
  // Prima che il turno passi davvero, la vista dice ancora "tocca a me": si aspetta il cambio di turno.
  for (let i = 0; i < 60 && (await ds(page, "model")).turn === turnBefore; i++) await page.waitForTimeout(100);
  m = await waitMyTurn();
  console.error(`turno ${turnBefore} → ${m.turn}, mio=${m.myTurn}`);
  if (m.turn > turnBefore + 1 || m.result) botTurns++;
  maxFoeBoard = Math.max(maxFoeBoard, m.foe.board.length);
  if (t === 3) await page.screenshot({ path: `${OUT}/vs-ai.png` });
}

const final = await ds(page, "model");
finish({ ok: botTurns >= 3 && maxFoeBoard > 0, botTurns, maxFoeBoard, turn: final.turn, myHealth: final.me.hero.health, foeHealth: final.foe.hero.health }, errors);
await browser.close();

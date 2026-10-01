// Prova end-to-end: il tutorial si completa seguendo i suggerimenti con gesti veri. Basta `npm run dev:client`.
import { L, OUT, ds, finish, handX, minionX, openBrowser, player, waitFor } from "./common.mjs";

const errors = [];
const browser = await openBrowser();
const page = await player(browser, "allievo", errors);
await page.mouse.click(900, 625); // Tutorial
await waitFor(page, "model");
await page.waitForTimeout(1200);

const hint = async () => (await ds(page, "hint")) ?? "";
const model = () => ds(page, "model");
const idx = (m, name) => m.me.hand.findIndex((c) => c.name === name);
const POWER = { x: L.boardX + 150, y: 548 };

/** Nuovo suggerimento, a plancia ferma (durante le animazioni i gesti sono ignorati). */
async function untilHintChanges(previous) {
  for (let i = 0; i < 160; i++) {
    const h = await hint();
    if (h && h !== previous && !/Tocca a Dr Grappolo/.test(h) && !(await ds(page, "animating"))) return h;
    await page.waitForTimeout(150);
  }
  throw new Error(`il tutorial non è andato avanti dopo: ${previous}`);
}

const seen = [];
let h = await hint();
for (let step = 0; step < 14; step++) {
  seen.push(h);
  if (/completato/i.test(h)) break;
  if (step < 3) await page.screenshot({ path: `${OUT}/tutorial-${step + 1}.png` });
  const m = await model();
  if (/Tieni la mano/.test(h)) await page.mouse.click(L.mulliganKeep.x, L.mulliganKeep.y);
  else if (/Trascina il Piccione/.test(h)) {
    await page.mouse.move(handX(idx(m, "Piccione urbano"), m.me.hand.length), L.handClickY);
    await page.mouse.down();
    await page.mouse.move(L.boardX, L.myBoard, { steps: 8 });
    await page.mouse.up();
  } else if (/Fine turno/.test(h)) await page.mouse.click(L.endTurn.x, L.endTurn.y);
  else if (/deve attaccare prima/.test(h)) {
    await page.mouse.click(minionX(0, m.me.board.length), L.myBoard);
    await page.waitForTimeout(300);
    await page.mouse.click(minionX(0, m.foe.board.length), L.foeBoard);
  } else if (/Piccione può attaccare/.test(h)) {
    await page.mouse.click(minionX(0, m.me.board.length), L.myBoard);
    await page.waitForTimeout(300);
    await page.mouse.click(L.foeHero.x, L.foeHero.y);
  } else if (/potere eroe/.test(h)) await page.mouse.click(POWER.x, POWER.y);
  else if (/Chiamata API/.test(h) || /Klaudioken/.test(h)) {
    const name = /Chiamata API/.test(h) ? "Chiamata API" : "Klaudioken";
    await page.mouse.click(handX(idx(m, name), m.me.hand.length), L.handClickY);
    await page.waitForTimeout(300);
    await page.mouse.click(L.foeHero.x, L.foeHero.y);
  } else throw new Error(`suggerimento non gestito: ${h}`);
  h = await untilHintChanges(h);
}
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/tutorial-fine.png` });
const final = await model();
finish({ ok: /completato/i.test(h) && final.result?.outcome === "win", steps: seen.length, lastHint: h, result: final.result }, errors);
await browser.close();

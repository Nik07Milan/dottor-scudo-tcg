// Prova end-to-end (T4.4): ricaricare la pagina durante la partita riporta al tavolo con lo stesso stato.
import { OUT, ds, finish, openBrowser, startMatch, waitFor } from "./common.mjs";

const errors = [];
const browser = await openBrowser();
const { p1, p2 } = await startMatch(browser, errors);

const before = await ds(p2, "model");
await p2.reload();
const after = await waitFor(p2, "model");
await p2.waitForTimeout(1200);
await p2.screenshot({ path: `${OUT}/dopo-ricarica-p2.png` });
const p1View = await ds(p1, "model");

const result = {
  backAtTable: !!after,
  sameTurn: before.turn === after.turn,
  samePhase: before.phase === after.phase,
  sameHand: JSON.stringify(before.me.hand.map((c) => c.instanceId)) === JSON.stringify(after.me.hand.map((c) => c.instanceId)),
  gameStillRunningForP1: p1View.phase === "main" && !p1View.result,
};
finish({ ok: Object.values(result).every(Boolean), ...result }, errors);
await browser.close();

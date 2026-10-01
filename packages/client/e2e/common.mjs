// Utilità delle prove end-to-end (M4). Richiedono server e client avviati:
//   npm run dev:server   e   npm run dev:client
// Usano Chrome installato (E2E_CHANNEL=chromium per il Chromium di Playwright).
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

export const APP_URL = process.env.E2E_URL ?? "http://localhost:5173";
export const OUT = fileURLToPath(new URL("./screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

/** Coordinate del layout a 1280×720 (vedi BoardScene/LAYOUT e LobbyScene). */
export const L = {
  boardX: 655,
  myBoard: 400,
  foeBoard: 228,
  foeHero: { x: 655, y: 78 },
  handClickY: 690,
  endTurn: { x: 1171, y: 360 },
  lobby: { create: { x: 440, y: 560 }, join: { x: 940, y: 560 }, jackson: { x: 640, y: 270 }, calabrone: { x: 742, y: 420 } },
  mulliganKeep: { x: 640, y: 560 },
};
export const handX = (i, n) => L.boardX + (i - (n - 1) / 2) * Math.min(96, 640 / Math.max(1, n));
export const minionX = (i, n) => L.boardX + (i - (n - 1) / 2) * 108;

export async function openBrowser() {
  const channel = process.env.E2E_CHANNEL ?? "chrome";
  return chromium.launch(channel === "chromium" ? { headless: true } : { channel, headless: true });
}

export async function player(browser, name, errors) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name} pageerror: ${e.message}`));
  await page.goto(APP_URL);
  await page.waitForTimeout(1000);
  return page;
}

/** Hook di sviluppo esposto dal client (window.__DS__). */
export const ds = (page, key) => page.evaluate((k) => window.__DS__?.[k] ?? null, key);

export async function waitFor(page, key, tries = 80) {
  for (let i = 0; i < tries; i++) {
    const v = await ds(page, key);
    if (v) return v;
    await page.waitForTimeout(100);
  }
  throw new Error(`timeout in attesa di ${key}`);
}

/** Due giocatori: p1 crea con Jackson, p2 entra con il codice con Il Calabrone, entrambi tengono la mano. */
export async function startMatch(browser, errors) {
  const p1 = await player(browser, "p1", errors);
  await p1.mouse.click(L.lobby.jackson.x, L.lobby.jackson.y);
  await p1.mouse.click(L.lobby.create.x, L.lobby.create.y);
  const code = await waitFor(p1, "code");
  const p2 = await player(browser, "p2", errors);
  await p2.mouse.click(L.lobby.calabrone.x, L.lobby.calabrone.y);
  await p2.fill("input", code);
  await p2.mouse.click(L.lobby.join.x, L.lobby.join.y);
  await waitFor(p1, "model");
  await waitFor(p2, "model");
  await p1.waitForTimeout(500);
  await p1.mouse.click(L.mulliganKeep.x, L.mulliganKeep.y);
  await p2.mouse.click(L.mulliganKeep.x, L.mulliganKeep.y);
  await p1.waitForTimeout(2200);
  return { p1, p2, code };
}

export function finish(result, errors) {
  console.log(JSON.stringify({ ...result, errors }, null, 2));
  if (errors.length > 0 || result.ok === false) process.exitCode = 1;
}

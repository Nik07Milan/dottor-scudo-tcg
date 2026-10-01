// Disegno di carte, servitori ed eroi (T4.3, T4.6). Solo presentazione: riceve modelli già pronti.

import { CARDS_BY_ID, HEROES_BY_ID } from "@dottorscudo/engine";
import type { Scene } from "phaser";
import { croppedImage, heroPortrait, requestArt } from "./art";
import type { CardModel, ChoiceOption, HeroModel, MinionModel } from "../model";
import { COLORS, FACTION_COLORS, FONT, RARITY_COLORS } from "../theme";

type Container = Phaser.GameObjects.Container;

/** Da che altezza della copertina parte il ritaglio: sotto il titolo, dove c'è il personaggio. */
const COVER_FOCUS = 0.38;
/** Gli avatar (350×350, es. Margherita) hanno il viso al centro: il ritaglio parte più in alto. */
const AVATAR_FOCUS = 0.22;
const artFocus = (path: string | null | undefined) => (path?.includes("/avatar/") ? AVATAR_FOCUS : COVER_FOCUS);

export const CARD_W = 118;
export const CARD_H = 164;
export const MINION_W = 96;
export const MINION_H = 118;
export const HERO_W = 132;
export const HERO_H = 120;

function badge(scene: Scene, x: number, y: number, color: number, value: number | string, radius = 15): Container {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35).fillCircle(1, 2, radius);
  g.fillStyle(color, 1).fillCircle(0, 0, radius);
  g.lineStyle(2, 0xffffff, 0.8).strokeCircle(0, 0, radius);
  const t = scene.add.text(0, 0, String(value), { fontFamily: FONT, fontSize: `${Math.round(radius * 1.1)}px`, color: "#ffffff", fontStyle: "bold" });
  t.setOrigin(0.5).setStroke("#000000", 3);
  return scene.add.container(x, y, [g, t]);
}

/** Bordo luminoso per le cose selezionabili o bersagliabili. */
export function glow(scene: Scene, w: number, h: number, color: number, radius = 12): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.lineStyle(4, color, 0.95).strokeRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, radius + 3);
  g.lineStyle(10, color, 0.25).strokeRoundedRect(-w / 2 - 7, -h / 2 - 7, w + 14, h + 14, radius + 6);
  return g;
}

/** Carta a faccia in su (mano, Scopri, mulligan). */
export function cardView(scene: Scene, x: number, y: number, card: CardModel | (ChoiceOption & Partial<CardModel>), scale = 1): Container {
  const w = CARD_W;
  const h = CARD_H;
  const frame = FACTION_COLORS[card.faction ?? "neutrale"] ?? FACTION_COLORS.neutrale!;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 3, -h / 2 + 5, w, h, 12);
  g.fillStyle(frame, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
  g.fillStyle(COLORS.paper, 1).fillRoundedRect(-w / 2 + 6, -h / 2 + 24, w - 12, h - 30, 8);
  // Riquadro dell'arte (segnaposto finché l'immagine non è caricata).
  const art = { x: -w / 2 + 8, y: -h / 2 + 26, w: w - 16, h: 48 };
  g.fillStyle(0xd9d2bd, 1).fillRect(art.x, art.y, art.w, art.h);
  // Gemma della rarità accanto al tipo.
  g.fillStyle(RARITY_COLORS[card.rarity ?? "common"] ?? 0xdcdcdc, 1).fillCircle(-w / 2 + 16, -h / 2 + 82, 5);

  const name = scene.add
    .text(0, -h / 2 + 12, card.name, { fontFamily: FONT, fontSize: "12px", color: "#ffffff", fontStyle: "bold", align: "center", wordWrap: { width: w - 34 } })
    .setOrigin(0.5);
  const typeLabel = card.type === "minion" ? "Collega" : card.type === "spell" ? "Pratica" : "Strumento";
  const kind = scene.add.text(0, -h / 2 + 82, typeLabel, { fontFamily: FONT, fontSize: "10px", color: "#6b6f7a" }).setOrigin(0.5);
  const keywords = "keywords" in card && card.keywords?.length ? `${card.keywords.join(", ")}\n` : "";
  const body = scene.add
    .text(0, -h / 2 + 92, `${keywords}${card.text ?? ""}`, {
      fontFamily: FONT,
      fontSize: "10px",
      color: COLORS.textDark,
      align: "center",
      wordWrap: { width: w - 18 },
    })
    .setOrigin(0.5, 0);

  const parts: Phaser.GameObjects.GameObject[] = [g];
  const artPath = CARDS_BY_ID.get(card.cardId)?.art;
  const artKey = requestArt(scene, artPath);
  if (artKey) parts.push(croppedImage(scene, artKey, art.x, art.y, art.w, art.h, artFocus(artPath)));
  parts.push(name, kind, body, badge(scene, -w / 2 + 8, -h / 2 + 8, COLORS.mana, card.cost, 14));
  if (card.attack !== undefined) parts.push(badge(scene, -w / 2 + 10, h / 2 - 10, COLORS.attack, card.attack, 13));
  if (card.health !== undefined) parts.push(badge(scene, w / 2 - 10, h / 2 - 10, COLORS.health, card.health, 13));
  if (card.durability !== undefined) parts.push(badge(scene, w / 2 - 10, h / 2 - 10, COLORS.armor, card.durability, 13));
  const c = scene.add.container(x, y, parts);
  c.setSize(w, h).setScale(scale);
  return c;
}

/** Dorso di una carta (mano avversaria). */
export function cardBack(scene: Scene, x: number, y: number, scale = 0.5): Container {
  const g = scene.add.graphics();
  g.fillStyle(0x3a2a1c, 1).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 12);
  g.lineStyle(4, 0xd8b26a, 1).strokeRoundedRect(-CARD_W / 2 + 6, -CARD_H / 2 + 6, CARD_W - 12, CARD_H - 12, 9);
  const t = scene.add.text(0, 0, "DS", { fontFamily: FONT, fontSize: "34px", color: "#d8b26a", fontStyle: "bold" }).setOrigin(0.5);
  return scene.add.container(x, y, [g, t]).setSize(CARD_W, CARD_H).setScale(scale);
}

/** Servitore sulla scrivania. */
export function minionView(scene: Scene, x: number, y: number, m: MinionModel): Container {
  const w = MINION_W;
  const h = MINION_H;
  const g = scene.add.graphics();
  if (m.taunt) g.fillStyle(0x8a8f99, 1).fillRoundedRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12, 18);
  g.fillStyle(0x000000, 0.35).fillEllipse(2, h / 2 - 4, w, 18);
  g.fillStyle(m.stealthy ? 0x4b4f5a : COLORS.paper, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 16);
  g.lineStyle(3, m.frozen ? COLORS.frozen : COLORS.ink, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
  const art = { x: -w / 2 + 6, y: -h / 2 + 6, w: w - 12, h: 54 };
  g.fillStyle(0xd9d2bd, 1).fillRoundedRect(art.x, art.y, art.w, art.h, 10);
  const name = scene.add
    .text(0, 8, m.name, {
      fontFamily: FONT,
      fontSize: "11px",
      color: m.stealthy ? COLORS.text : COLORS.textDark,
      fontStyle: "bold",
      align: "center",
      wordWrap: { width: w - 12 },
    })
    .setOrigin(0.5, 0);
  const parts: Phaser.GameObjects.GameObject[] = [g];
  const artPath = CARDS_BY_ID.get(m.cardId)?.art;
  const artKey = requestArt(scene, artPath);
  if (artKey) {
    const img = croppedImage(scene, artKey, art.x, art.y, art.w, art.h, artFocus(artPath));
    if (m.stealthy) img.setAlpha(0.45); // Smart working: mezzo nascosto
    parts.push(img);
  }
  parts.push(name);
  if (m.shielded) {
    const s = scene.add.graphics();
    s.lineStyle(4, COLORS.shield, 0.9).strokeRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 18);
    parts.push(s);
  }
  if (m.frozen) {
    parts.push(scene.add.text(0, -h / 2 + 14, "in riunione", { fontFamily: FONT, fontSize: "11px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5).setStroke("#2a6f9a", 4));
  }
  const icons = m.keywords.filter((k) => !["Deploy", "Burocrazia", "Scudato", "Smart working"].includes(k));
  if (icons.length) parts.push(scene.add.text(0, 34, icons.join(" · "), { fontFamily: FONT, fontSize: "9px", color: "#6b6f7a", align: "center", wordWrap: { width: w - 10 } }).setOrigin(0.5));
  parts.push(badge(scene, -w / 2 + 8, h / 2 - 10, COLORS.attack, m.attack, 14));
  const hp = badge(scene, w / 2 - 8, h / 2 - 10, m.damaged ? 0x9b2c25 : COLORS.health, m.health, 14);
  parts.push(hp);
  const c = scene.add.container(x, y, parts);
  c.setSize(w, h);
  return c;
}

/** Ritratto dell'eroe con ferie, armatura e Strumento. */
export function heroView(scene: Scene, x: number, y: number, hero: HeroModel): Container {
  const w = HERO_W;
  const h = HERO_H;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 3, -h / 2 + 5, w, h, 20);
  g.fillStyle(0x3b4252, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 20);
  g.lineStyle(3, 0xd8b26a, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 20);
  const initials = hero.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
  // Ritratto (solo se confermato), altrimenti le iniziali.
  const portraitKey = requestArt(scene, heroPortrait(hero.heroId) ? HEROES_BY_ID.get(hero.heroId)!.portrait : null);
  const portrait = portraitKey
    ? croppedImage(scene, portraitKey, -w / 2 + 8, -h / 2 + 6, w - 16, h - 34, 0.08)
    : scene.add.text(0, -12, initials, { fontFamily: FONT, fontSize: "40px", color: "#d8b26a", fontStyle: "bold" }).setOrigin(0.5);
  const name = scene.add.text(0, h / 2 - 16, hero.name, { fontFamily: FONT, fontSize: "13px", color: COLORS.text, fontStyle: "bold" }).setOrigin(0.5);
  const parts: Phaser.GameObjects.GameObject[] = [g, portrait, name, badge(scene, w / 2 - 6, h / 2 - 8, COLORS.health, hero.health, 18)];
  if (hero.armor > 0) parts.push(badge(scene, w / 2 - 6, h / 2 - 42, COLORS.armor, hero.armor, 14));
  if (hero.weapon) {
    parts.push(badge(scene, -w / 2 + 6, h / 2 - 8, COLORS.attack, hero.weapon.attack, 16));
    parts.push(
      scene.add
        .text(-w / 2 + 6, h / 2 - 34, `${hero.weapon.name} (${hero.weapon.durability})`, { fontFamily: FONT, fontSize: "10px", color: COLORS.text })
        .setOrigin(0, 0.5),
    );
  }
  const c = scene.add.container(x, y, parts);
  c.setSize(w, h);
  return c;
}

/** Bottone rettangolare con testo. */
export function button(scene: Scene, x: number, y: number, label: string, w = 160, h = 44, color = 0xd8b26a): Container {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w, h, 10);
  g.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 10);
  const t = scene.add.text(0, 0, label, { fontFamily: FONT, fontSize: "16px", color: COLORS.textDark, fontStyle: "bold", align: "center" }).setOrigin(0.5);
  const c = scene.add.container(x, y, [g, t]);
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  return c;
}

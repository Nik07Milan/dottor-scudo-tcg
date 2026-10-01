// Arte delle carte e ritratti (T5.1). Le immagini restano dove sono in assets/ (CLAUDE.md: non toccarle):
// Vite le indicizza tutte e i percorsi di cards.json / heroes.json si risolvono per nome di file.
// Le tavole sono copertine 1024×1536: nelle carte se ne mostra un ritaglio sotto il titolo.

import { HEROES_BY_ID } from "@dottorscudo/engine";
import type { Scene } from "phaser";

const FILES = import.meta.glob("../../../../assets/**/*.{webp,jpg,jpeg,png}", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const BY_NAME = new Map(Object.entries(FILES).map(([path, url]) => [path.split("/").pop()!, url]));

/** Evento della scena quando un'immagine richiesta è pronta: la plancia si ridisegna. */
export const ART_READY = "art-ready";

const basename = (path: string) => path.split("/").pop()!;

/** URL di un'immagine indicata in cards.json/heroes.json, o null se non c'è. */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return BY_NAME.get(basename(path)) ?? null;
}

/** Ritratto di un eroe, solo se confermato (GDD §8: abbinamento avatar ↔ personaggi da confermare). */
export function heroPortrait(heroId: string): string | null {
  const hero = HEROES_BY_ID.get(heroId);
  return hero?.portraitConfirmed ? assetUrl(hero.portrait) : null;
}

const loading = new Set<string>();

/**
 * Chiave della texture se l'immagine è già caricata; altrimenti avvia il caricamento (una volta sola)
 * e restituisce null. A caricamento finito la scena riceve ART_READY.
 */
export function requestArt(scene: Scene, path: string | null | undefined): string | null {
  const url = assetUrl(path);
  if (!url) return null;
  const key = `art:${basename(path!)}`;
  if (scene.textures.exists(key)) return key;
  if (!loading.has(key)) {
    loading.add(key);
    scene.load.image(key, url);
    scene.load.once(`filecomplete-image-${key}`, () => {
      loading.delete(key);
      scene.events.emit(ART_READY);
    });
    if (!scene.load.isLoading()) scene.load.start();
  }
  return null;
}

/**
 * Immagine ritagliata a riempire il riquadro (x, y, w, h) — coordinate locali del contenitore.
 * `focusY`: da che altezza della sorgente (0–1) parte il ritaglio.
 */
export function croppedImage(scene: Scene, key: string, x: number, y: number, w: number, h: number, focusY = 0): Phaser.GameObjects.Image {
  const img = scene.add.image(0, 0, key).setOrigin(0, 0);
  const sw = img.width;
  const sh = img.height;
  const scale = Math.max(w / sw, h / sh);
  const cropW = w / scale;
  const cropH = h / scale;
  const cropX = (sw - cropW) / 2;
  const cropY = Math.min(Math.max(0, sh * focusY), sh - cropH);
  img.setScale(scale).setCrop(cropX, cropY, cropW, cropH);
  img.setPosition(x - cropX * scale, y - cropY * scale);
  return img;
}

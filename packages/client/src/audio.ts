// Audio (T4.6, pronto per M5): chiavi dei suoni usate dalla plancia. Finché i file non ci sono
// (sigle e effetti arrivano in M5) le chiamate non fanno nulla.

import type { Scene } from "phaser";

export type SoundKey = "music" | "play" | "attack" | "damage" | "death" | "turn" | "win" | "lose";

export function playSound(scene: Scene, key: SoundKey, config?: Phaser.Types.Sound.SoundConfig): void {
  if (!scene.cache.audio.exists(key)) return;
  scene.sound.play(key, config);
}

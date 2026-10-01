import { describe, expect, it } from "vitest";
import { accessToken, getAccount, isValidEmail, nicknameError, sendMagicLink, supabase } from "../src/account";

describe("account (T5.3)", () => {
  // Vitest legge packages/client/.env: con Supabase configurato questo caso non si può provare.
  it.skipIf(Boolean(import.meta.env.VITE_SUPABASE_URL))("senza variabili d'ambiente si gioca da ospite", async () => {
    expect(supabase).toBeNull();
    expect(getAccount()).toBeNull();
    await expect(accessToken()).resolves.toBeNull();
    await expect(sendMagicLink("a@b.it")).resolves.toBe("Account non disponibili");
  });

  it("email e nickname rispettano gli stessi vincoli del database", () => {
    expect(isValidEmail(" mario@ufficio.it ")).toBe(true);
    expect(isValidEmail("mario@")).toBe(false);
    expect(nicknameError("Mario")).toBeNull();
    expect(nicknameError("ab")).toMatch(/almeno 3/);
    expect(nicknameError("x".repeat(25))).toMatch(/al massimo 24/);
  });
});

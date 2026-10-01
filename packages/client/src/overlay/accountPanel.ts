// Pannello account della lobby (T5.3): email → magic link; da collegato nickname modificabile ed "Esci".

import type { Scene } from "phaser";
import { getAccount, onAccountChange, sendMagicLink, setNickname, signOut, supabase, type Account } from "../account";
import { el, ensureStyles } from "./dom";

/** Aggiunge il pannello alla scena, centrato in (x, y). Non fa nulla se Supabase non è configurato. */
export function mountAccountPanel(scene: Scene, x: number, y: number): void {
  if (!supabase) return;
  ensureStyles();
  const root = el("div", { class: "ds-ui ds-panel", style: "width: 290px;" });
  let sentTo: string | null = null;
  let editing = false;

  const render = (account: Account | null) => {
    root.replaceChildren(account ? signedIn(account) : signedOut());
  };

  const signedOut = () => {
    if (sentTo) {
      return el(
        "div",
        { class: "ds-col" },
        el("div", {}, "Controlla la posta:"),
        el("div", { class: "ds-muted" }, `ti ho mandato un link di accesso a ${sentTo}.`),
        el("button", { class: "ds-link", onclick: () => ((sentTo = null), render(getAccount())) }, "Usa un'altra email"),
      );
    }
    const email = el("input", { type: "email", placeholder: "la-tua@email.it", autocomplete: "email", style: "flex: 1;" });
    const error = el("div", { class: "ds-error" });
    const send = el("button", {}, "Accedi");
    const submit = async () => {
      send.disabled = true;
      const message = await sendMagicLink(email.value);
      send.disabled = false;
      if (message) error.textContent = message;
      else {
        sentTo = email.value.trim();
        render(getAccount());
      }
    };
    send.addEventListener("click", () => void submit());
    email.addEventListener("keydown", (e) => e.key === "Enter" && void submit());
    return el(
      "div",
      { class: "ds-col" },
      el("div", { class: "ds-muted" }, "Accedi per salvare mazzi e partite"),
      el("div", { class: "ds-row" }, email, send),
      error,
    );
  };

  const signedIn = (account: Account) => {
    const nickname = account.profile?.nickname ?? account.session.user.email ?? "giocatore";
    if (editing) {
      const input = el("input", { value: nickname, maxLength: 24, style: "flex: 1;" });
      const error = el("div", { class: "ds-error" });
      const save = async () => {
        const message = await setNickname(input.value);
        if (message) error.textContent = message;
        else {
          editing = false;
          render(getAccount());
        }
      };
      input.addEventListener("keydown", (e) => e.key === "Enter" && void save());
      return el(
        "div",
        { class: "ds-col" },
        el("div", { class: "ds-row" }, input, el("button", { onclick: () => void save() }, "Salva")),
        el("button", { class: "ds-link", onclick: () => ((editing = false), render(getAccount())) }, "Annulla"),
        error,
      );
    }
    return el(
      "div",
      { class: "ds-row", style: "justify-content: space-between;" },
      el(
        "div",
        { class: "ds-col", style: "gap: 2px;" },
        el("div", {}, "Ciao, ", el("b", {}, nickname)),
        el("button", { class: "ds-link", style: "font-size: 13px; align-self: flex-start;", onclick: () => ((editing = true), render(getAccount())) }, "cambia nickname"),
      ),
      el("button", { class: "ds-secondary", onclick: () => void signOut() }, "Esci"),
    );
  };

  render(getAccount());
  const stop = onAccountChange(render);
  scene.events.once("shutdown", stop);
  scene.add.dom(x, y, root);
}

/**
 * The Light of the Gospel mark, in the one form both the screen and the printer can use.
 *
 * The cup label is drawn twice — once as HTML in /admin/labels, once as a PDF on the shop
 * PC — so the logo has to exist somewhere both of them can reach. A file in public/ is
 * only reachable by the browser; a file in print-agent/ is only reachable by the agent.
 * So the artwork is embedded here as base64, in a dependency-free module (no React, no
 * supabase, no '@/' imports) that the agent imports directly, exactly like labels.ts.
 * One copy, one look, no drift.
 *
 * It is a pure-black silhouette on transparency, not the brown original: thermal printers
 * are 1-bit, so a mid-tone brown dithers into mush at 5mm tall. The full-colour logo for
 * web use lives at public/lotg-logo.png.
 *
 * To replace it: run the artwork through a threshold to solid black, save as an RGBA PNG
 * around 200px tall, and paste the base64 in below along with its aspect ratio.
 */

/** Width ÷ height of the artwork. The label only ever sets a height. */
export const LOGO_ASPECT = 168 / 200;

/** Printed above the drink on every cup. Editable at /admin/labels. */
export const DEFAULT_CHURCH_NAME = 'Light of the Gospel';

/** RGBA PNG, 168 × 200, black on transparent. */
export const LOGO_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAKgAAADICAYAAAB8v6ruAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAEMklEQVR42u3dUXKjMBBF" +
  "Ufa/aWYDqYwdhPp169wq/00cLE5kjDBzXXra/ctDAlQCVIBKgApQQAWoBKgAlQAVoIAKUAlQASoBKgEqQCVABagEqASoAJUA" +
  "FaASoBKgAlQCVIACqgdopj0EKKACFFBAARWggApQQAEFVIACCiig8scAjwCVABWgEqASoAJUOgeo86qAxu1sCwCAxu5kq1QC" +
  "VIACKseggAIKqAAFVIAK0LDzoNACCqgAfYITUEDjgDouBTQK6P9+NnLwdcZK0ic/Gzv4mg30Kpo9Hz+3Y5D5QK+C2XPZczuB" +
  "OxtoxetZ+rxWGnqOTyLOV57bkthMoE///Zvbsu1AG9C87do5CW1z4yKDXkCrcW634mqY3kB3zXBlRnx1oA/QVbPmN6+h3IZ7" +
  "WfYDuuNQLcqEm672Pg23ch9FOnB34HMvt3vLQJvbagN6FszXxsf91vt9SHoy9m33Nah5QLvA/Hpsdq0WTIVavf2dYP7pbETF" +
  "0tYkqFXbPfWt/Mefr1zq6g61YnvTYS5fmq345VOg7tzOSTC/er7qv5TOSHdtYyrMba/hBjUSaCLMkuPlbhuffmnbvRln2mSw" +
  "/HclHCd2hFp1FfquWTPmnTH5VEMy1De2oRpm7BmbxBWidKQVrzfhmt0SJ+n/z3ki1N2vsRJmuY274NEd6q5ZqWoc4kzchY+O" +
  "X+jbuqKyCead7OAOeXSB+uZMtfN1ttnvd9gj+vvYLwLd9VXelvv7Dn0k3hVl+eVloV8PBjTlwoQCoE9nzSn7dBTQXZ+UU1eS" +
  "pu3H+xryFvD2rJq+kmT/NX+RK47HEmfk6fvrOKBPoaacBz1hH93XhvOKUwZh5dtp5Q2/xgOdPBifvmXu/hR/H7ovAA0/D3of" +
  "PP6AFq5aGfOXJwmDVbsWb8wN3KvLhsYY0PZA4QR022kpQJvfAhxQ4wpowflSQAEFFE4DCWhToI5DAQUUUOMKKKBjgVr6BBTQ" +
  "g4A6/gR0y2ACGnZTNwMKKKCAAgoooONwAgpoPFBfBQEUUEABBRTQkTh9JRZQQAEFFFBAx+IEFNB4oJfBBRRQQOEEFNCpQN0B" +
  "D1BAAQUUUEBH4jxlsAEFFFBAAQX0QJyAAhoP9AIUUEABhRPQLUDNnpACCiiggDbCCSiggAIKKKSAjsUJKKCAAgoopICOxXna" +
  "LAoooIDCCSmghwG9AHWMDimgcEIK6FSYk3YMoMNxdt9BgB4YoGCCCiiYJ2A9BaiaYp0MVAOwTgKqgVi7A9VwsB2B6iCoq4BC" +
  "qVcgJAMVqJFABWokUIEaCVSgRgIVpLFABWksUOljODuBSltWhVb+IUjlQKU/IwVULZGuAio9RvoWUGkJ0jeASrFApaVIAVU0" +
  "0pVAJUB1FtJVQKXo1ScJUAlQASoBKkAlQCVABagEqACVAJUAFaASoAIUUAEqASpA9Uv/ADVKfBnNHC5wAAAAAElFTkSuQmCC";

/** For an <img src>. The preview uses this; the agent decodes the base64 instead. */
export const LOGO_DATA_URI = `data:image/png;base64,${LOGO_PNG_BASE64}`;

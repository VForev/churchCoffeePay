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
 * It is a pure-black silhouette, not the brown original: thermal printers are 1-bit, so a
 * mid-tone brown dithers into mush at 3mm tall. The full-colour logo for web use lives at
 * public/lotg-logo.png.
 *
 * It is also FLATTENED ONTO WHITE with no alpha channel, which matters more than it looks.
 * PDFKit turns a transparent PNG into a soft mask, and cheap thermal drivers are known to
 * drop masked images and print the label with a hole where the logo should be. The label is
 * white paper, so opaque white costs nothing and removes that whole class of failure.
 *
 * To replace it: threshold the artwork to solid black, flatten it onto white, save as an
 * opaque PNG around 200px tall, and paste the base64 in below with its aspect ratio.
 */

/** Width ÷ height of the artwork. The label only ever sets a height. */
export const LOGO_ASPECT = 168 / 200;

/** Printed above the drink on every cup. Editable at /admin/labels. */
export const DEFAULT_CHURCH_NAME = 'Light of the Gospel';

/** Opaque PNG, 168 × 200, solid black on white. No alpha — see the note above. */
export const LOGO_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAKgAAADICAIAAADz3T25AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAEv0lEQVR42u3dwYKkMAhF" +
  "Uf7/p5ldr3psTYDAy2VtlUmOWkrFYH5Z2G/h94UBDzzwwAMPPPDAAw888MADDzzwwAMPPPDAAw888MADDzzwwAMPPPDAAw88" +
  "8MADDzzwwAMPPPDAAw888MADDzzwwAMPPPDnnToH8MADDzzwwAMPPPDAAw888MADDzyZOzJ3wAMPPPDAAw888MADDzzwwB+A" +
  "b5IDAL5oxLulgICvGOuG6T/ggQceeODP2gMPPPDAAw888OLP8XnNAx544BvA//oR4C+Cz24e8I3g/7dxHbzwn5VtM3cPG1fD" +
  "S9r3hH/YOGTXHy71qvMUGsI/bxmy00V4Jftu8Elt+/Mb7LYpSvX9KlZ/+SXWfIaQMPzXbUJ2tAU/mr8DfPg5tiBlUQ8hwB9R" +
  "XwayQfMDp8OHnKk7OeB4+EH8lS1fO9H/bFIIioW/mw78c/JkSyuOw5LWJQA+9rYpXMFSF6QAfv8nOWn8rWAlEh7n6sl34QNX" +
  "obn85u7T4BQMuBUvQnQJ/Fnyb0+DlUeAMPxx8vUWlh0BYvCdL+y/7GjzH4Jx/EltOEW+nDa2qP9jpvCH770t+fNnLTwn39w+" +
  "dtf15FFNsqQXfNry5813SCUPv8mw7LR8N/6Q3VVmY5JevreagzH2D4az8DUnevY11U4+UZzg39xFNnnZY5Sdys2dsk9qc8FU" +
  "hlgdy1sZvuc6YBlNTSVPQrHskgDd+GNPuLxeZHNYWTmI7KkK9fAZ5GZFBTSsvg7IWf6Q8y+8tfUjb6cKwOTNGM+Gj3374NSY" +
  "2/HiP8UL/+7w1E+OVoaP+tchD/7rid62qFZT+Ngb7PrMnfcuovbH1CuzMQXc6g+ahY+3HU/rX+Nv5347+2oxqE7iPPiv/DXP" +
  "8bPqYr6aZWs2tYbn8rXXM999HAM/paLrA1LGXf1QckH4suf41NnvwJ9MBbpoaevPK2Io9TAjVy8LP7qrSZk74O+Cl1TXhI+9" +
  "q78OXvWkz156BPi+T/nAAy8O72sLIwB/KbzkzzzwwIvD+84aOMBfCq+XvgUe+KmzKoAPWxv0ttP97Tp3wAMPPPDAj56XADzw" +
  "avbAAw888OrwHl5GHHjggQce+JmvlwAPvJw98MBfAf+NEnjg1eyBBx544EXhPzu6u6o98MADD7wi/Aoi8MCr2QMPvDL8oiDw" +
  "oxewq4Yfupwj8MCLwK/zAQ888MBL2MvDb9kBDzzwwEvYa8PvwgnDvxcFHvjx9VmK4Mdd7YEPgx9WfWk+fAyZBwXwg9Qj4UdU" +
  "2RsN76ER/HXdhkwGPp7JcwL4tuS58G1rUw+Cz6Xx/AC+FXkd/MHRnAVfauEnAvhT3ofhy8a3LbyfjvMtSB3obvDeJho1JWPQ" +
  "m8B3HGTvGgfhhb0HwIcwHIH3CTGjlcsYxfA+Jya1dYGkDN6nxbwWf4IpgPeZMbXdL3lS4X1yDG/9OXgfHvM7cALe54dCHx6o" +
  "wuFdJYR6kg/vQgH8W3jXCq2jGPg74d/Yr8G7XCh2KRreFUO0V3HwLhrAP23juqF7RAN/J/yP3zK8SwfwwIvar8G7euj38MLk" +
  "DPDAAw888MADDzzwwAMPPPDAAw888MADDzzwwAMPPPDAAw888MADDzzwwAOfPQ7/AE762NMTAqsvAAAAAElFTkSuQmCC";

/** For an <img src>. The preview uses this; the agent decodes the base64 instead. */
export const LOGO_DATA_URI = `data:image/png;base64,${LOGO_PNG_BASE64}`;

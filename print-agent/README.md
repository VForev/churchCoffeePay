# Cup Label Printer

Prints a label for every cup, automatically, the moment an order comes in.

This runs on the **shop computer** with the label printer plugged into it — **Windows or
Mac**, either works. It's not on Netlify or the iPad. The website doesn't talk to the
printer at all; this agent watches the orders database and prints. That's deliberate: if
the printer jams or the computer is off, orders keep flowing and the barista board keeps
working.

---

## One-time setup

### 1. Get the printer working by itself first

Before touching any of this, make the computer itself print to the label printer:

- **Windows:** plug it in by USB, install the CLABEL 221B driver (from `ga.ctaiot.com`),
  then print a test page from Notepad.
- **Mac:** plug it in, add it under **System Settings → Printers & Scanners**, then print
  anything to it. When you print, set the **paper size to your label size** — this printer
  needs to be told the size or it feeds out blank.

**If the computer can't print to it on its own, nothing below will work.** Fix this first.

The agent then sends that same paper size automatically, so you don't have to set it every
time — but the printer/driver has to be installed and working first.

### 2. Run the database migrations

In the [Supabase SQL Editor](https://supabase.com/dashboard/project/errkudkpnrjzyjboemwy/sql),
run these files from the project root:

- `supabase-label-printing.sql` — adds one column to orders
- `supabase-label-settings.sql` — adds the label layout that `/admin/labels` edits
- `supabase-label-cups.sql` — makes multi-drink orders print **every** cup, and adds
  the per-cup reprint buttons on the barista board

### 3. Install the agent

Install [Node.js](https://nodejs.org) (LTS) on the shop computer. That's the only thing
you install by hand.

Then just **double-click `start-printer.bat`** (Windows) or **`start-printer.command`**
(Mac). The first run installs the agent's dependencies for you, creates the `.env` from
the example, and opens it so you can fill it in — no command line needed. (If you'd rather
do it manually: `npm install`, then `cp .env.example .env`.)

Open `.env` and fill in:

- **`NEXT_PUBLIC_SUPABASE_URL`** and **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** — copy them
  from the website's `.env.local`.
- **`PRINTER_NAME`** — leave blank to use the computer's default printer. If there's more
  than one printer, paste the exact name (Windows: from Printers & scanners; Mac: run
  `lpstat -e` in Terminal, e.g. `Clabel__CT221B`).

**The label size is not in this file.** It's set in the browser at **`/admin/labels`** —
see below.

### 4. Set the label size and test it before Sunday

Go to **`/admin/labels`** in the admin panel. **Measure your actual label** — the sticker,
not the backing paper — and enter its width and height. Getting this wrong is the single
most common reason labels come out misaligned.

The preview on that page shows what will print. When it looks right, hit **Save layout**,
then **🖨 Send test label** — a real label comes out of the printer on this PC. Check that
it fills the sticker without running off the edges.

You can also print a test from this PC directly:

```bash
npm run test-label
```

Layout changes made in admin take effect **immediately** — the agent picks them up while
it's running. No restart, and nobody has to come back to this PC.

---

## Running it on a service morning

**Double-click `start-printer.bat`** (Windows) or **`start-printer.command`** (Mac) in this
folder. That's the whole job — the same double-click every week. Or from a terminal:

```bash
npm start
```

Leave the window open. It prints:

```
LOTG label printer
  Printer:    (system default)
  Label size: 40 × 30 mm
  Paper size: "w113h85"

No missed orders.
Listening for orders. Leave this window open.
🖨  Sarah K — 2 labels
```

Once you see **"Listening for orders,"** it's working — every order prints a label.

**On a Mac laptop, keep it awake.** If the Mac sleeps, printing stops. The double-click
launcher already runs it under `caffeinate` so it won't idle-sleep, but also keep it **on
power with the lid open** during service.

To make it start by itself when the computer boots:
- **Mac:** System Settings → General → Login Items → add `start-printer.command`.
- **Windows:** press <kbd>Win</kbd>+<kbd>R</kbd>, type `shell:startup`, and drop a shortcut
  to `start-printer.bat` in the folder that opens.

---

## What's on a label

One label **per cup** — a 3-drink order prints 3 labels. Everything below can be turned
on or off, resized, or reshaped at **`/admin/labels`** without touching this PC.

```
┌────────────────────────────┐
│        COLD CUP            │  ← reversed out of black, first thing you see
│  ✝ Light of the Gospel     │  ← church mark and name, switchable in /admin/labels
│  ────────────────────────  │
│                 CUP 1 OF 2 │
│  Sarah K                   │  ← the name you'll call out
│  Vanilla Latte             │
│  Large, Oat Milk, 2 Shots  │
│  ┌──────────────────────┐  │
│  │ ! Extra hot          │  │  ← special instructions, boxed
│  └──────────────────────┘  │
│  #7F3A · 9:42 AM           │
└────────────────────────────┘
```

Hot vs cold comes from the same logic the barista board uses (`src/lib/temperature.ts`) —
the drink's Temperature modifier first, then the drink's name. If it genuinely can't tell
(a pastry, a bottled water), the band is left off rather than guessed.

The church mark is a solid-black silhouette stored as base64 in `src/lib/logo.ts`, so the
agent and the admin preview draw the identical artwork with no shared image file to keep
in sync. Both the mark and the name can be switched off, renamed and resized at
`/admin/labels` — on a short 50 × 30 roll that row costs about a line and a half of
modifiers, so it's worth checking the preview before you leave it on.

---

## When something goes wrong

**Nothing prints.** Is the window still open? Is the PC awake — check Windows sleep
settings. Run `npm run test-label` to test the printer without needing an order.

**The label feeds out blank — it comes out but nothing is printed on it.** The print job
isn't telling the printer the label size, so the printer uses a default and the design
lands off the label. The agent now sends the size automatically, but if your printer names
its sizes oddly it may not auto-match. To fix it:

1. Run `npm run doctor`. It lists **every paper size your printer supports** and shows which
   one it picked (marked `➜`).
2. If nothing is picked, or the wrong one is, find the size that matches your label (e.g.
   `40mm x 30mm`) in that list and copy it **exactly** into `PRINTER_PAPER_SIZE` in your
   `.env`. Save.
3. Run `npm run doctor` again — it should now print.

Make sure the size at `/admin/labels` also matches your real label (e.g. 40 × 30 mm), so the
design is drawn at the right shape.

If it's *still* blank, find out whether it's the PDF or the printer: set `KEEP_PDF=1` in
`.env`, run `npm run test-label`, and open the PDF path it prints. If the PDF shows the
label, the printer/driver is the problem (paper size, above). If the PDF is blank, tell the
developer — that's a software issue, not your setup.

**Labels are the wrong size, or text runs off the edge.** Go to `/admin/labels`, measure
the sticker again, and correct the width and height. Save, then send a test label.

**I changed the layout in admin and nothing changed.** The test label prints the layout
that's *saved* — if you didn't press **Save layout** first, the printer is still using the
old one. The page warns about this.

**A label jammed, or someone dropped a cup.** On the barista board, tap **🖨 Reprint all
cups** on that order's card, or **🖨 Print one cup** to pick just the drink being remade —
a five-cup order shouldn't spit out four labels nobody needs. The agent prints within a
second or two.

**A multi-drink order only printed one cup.** Run `supabase-label-cups.sql` (see step 2).
The app inserts an order's drinks one at a time, so without that migration the agent could
start printing when only the first drink had arrived. With it, the app says how many drinks
to expect and the agent waits for all of them.

**The agent was off for the first half of service.** Just start it — on startup it prints
every unprinted order from the last 6 hours, in order. Nothing is lost, and nothing that
already printed prints twice.

**Labels printed twice.** That shouldn't happen: the database column `label_printed_at` is
the guard. If it does, the agent is probably running in two windows at once — close one.

**Everything on the card shows an amber "Print labels" button.** That means the orders were
never printed, which almost always means the agent isn't running.

# Cup Label Printer

Prints a label for every cup, automatically, the moment an order comes in.

This runs on the **shop PC** with the label printer plugged into it — not on Netlify,
not on the iPad. The website doesn't talk to the printer at all; this agent watches the
orders database and prints. That's deliberate: if the printer jams or the PC is off,
orders keep flowing and the barista board keeps working.

---

## One-time setup

### 1. Get the printer working in Windows first

Before touching any of this, make Windows itself print to the label printer:

1. Plug the printer into the PC by **USB** and install the CLABEL 221B Windows driver
   (from `ga.ctaiot.com`).
2. Open **Settings → Bluetooth & devices → Printers & scanners** and confirm it appears.
3. Right-click it → **Printing preferences** → set the paper size to your label size.
4. Print a test page from Notepad.

**If Notepad can't print to it, nothing below will work.** Fix this step first.

### 2. Run the database migrations

In the [Supabase SQL Editor](https://supabase.com/dashboard/project/errkudkpnrjzyjboemwy/sql),
run these two files from the project root:

- `supabase-label-printing.sql` — adds one column to orders
- `supabase-label-settings.sql` — adds the label layout that `/admin/labels` edits

### 3. Install the agent

Install [Node.js](https://nodejs.org) (LTS) on the shop PC, then in this folder:

```bash
npm install
copy .env.example .env
```

Open `.env` and fill in:

- **`NEXT_PUBLIC_SUPABASE_URL`** and **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** — copy them
  from the website's `.env.local`.
- **`PRINTER_NAME`** — leave blank to use the Windows default printer. If the PC has more
  than one printer, paste the exact name shown in Windows.

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

```bash
npm start
```

Leave the window open. It prints:

```
LOTG label printer
  Printer:    (Windows default)
  Label size: 50 × 30 mm

No missed orders.
Listening for orders. Leave this window open.
🖨  Sarah K — 2 labels
```

To make it start by itself when the PC boots, create a shortcut to `start-printer.bat`
(in this folder) and drop it in the Startup folder — press <kbd>Win</kbd>+<kbd>R</kbd>,
type `shell:startup`, and paste the shortcut there.

---

## What's on a label

One label **per cup** — a 3-drink order prints 3 labels. Everything below can be turned
on or off, resized, or reshaped at **`/admin/labels`** without touching this PC.

```
┌────────────────────────────┐
│        COLD CUP            │  ← reversed out of black, first thing you see
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

---

## When something goes wrong

**Nothing prints.** Is the window still open? Is the PC awake — check Windows sleep
settings. Run `npm run test-label` to test the printer without needing an order.

**Labels are the wrong size, or text runs off the edge.** Go to `/admin/labels`, measure
the sticker again, and correct the width and height. Save, then send a test label.

**I changed the layout in admin and nothing changed.** The test label prints the layout
that's *saved* — if you didn't press **Save layout** first, the printer is still using the
old one. The page warns about this.

**A label jammed, or someone dropped a cup.** On the barista board, tap **🖨 Reprint** on
that order's card. The agent prints it again within a second or two.

**The agent was off for the first half of service.** Just start it — on startup it prints
every unprinted order from the last 6 hours, in order. Nothing is lost, and nothing that
already printed prints twice.

**Labels printed twice.** That shouldn't happen: the database column `label_printed_at` is
the guard. If it does, the agent is probably running in two windows at once — close one.

**Everything on the card shows an amber "Print labels" button.** That means the orders were
never printed, which almost always means the agent isn't running.

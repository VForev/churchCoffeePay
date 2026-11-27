-- ─────────────────────────────────────────────────────────────────────────────
-- Pictures — drink photos, the drink of the day, and the backgrounds.
-- Edited at /admin/pictures (plus /admin/menu and /admin/specialty).
--
-- Three things:
--
--   1. site_pictures   one row, id = 1. How drinks without a photo look, and the
--                      banner / page / lobby-TV background pictures.
--   2. specialty_drink.image_url   the drink of the day's own picture.
--   3. a storage bucket, `pictures`, that admins upload into from the browser.
--
-- Until this runs, nothing changes: drinks show the photo they already have (or a cup),
-- there are no background pictures, and /admin/pictures says to run this file. Drink
-- photos pasted as links in /admin/menu keep working either way — that column
-- (menu_items.image_url) has always existed.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_pictures (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- What a drink with no photo of its own shows:
  --   'icon'     a cup in the drink's colour (how the menu has always looked)
  --   'default'  default_drink_image, the shop's own stand-in photo
  --   'none'     no pictures on the menu at all — names only
  drink_mode TEXT NOT NULL DEFAULT 'icon'
    CHECK (drink_mode IN ('icon', 'default', 'none')),
  default_drink_image TEXT,

  -- Behind the big banner at the top of the menu.
  banner_image TEXT,
  -- Behind the customer pages: menu, checkout, confirmation, the phone's live board.
  page_background_image TEXT,
  -- Behind the lobby TV (/live).
  live_background_image TEXT,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO site_pictures (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE site_pictures;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Anyone can read it (every customer's phone needs to). Only a signed-in admin can change
-- it. Stricter than the other settings tables on purpose: a picture is the one setting a
-- prankster with the public key could use to put anything they liked on the menu.
ALTER TABLE site_pictures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read pictures" ON site_pictures;
DROP POLICY IF EXISTS "Admins change pictures" ON site_pictures;
CREATE POLICY "Anyone can read pictures" ON site_pictures FOR SELECT USING (true);
CREATE POLICY "Admins change pictures" ON site_pictures FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── The drink of the day's own picture ─────────────────────────────────────
-- Only if that feature's table exists (supabase-specialty-drink.sql); run that first
-- and then this again if you want it.
DO $$
BEGIN
  IF to_regclass('public.specialty_drink') IS NOT NULL THEN
    ALTER TABLE specialty_drink ADD COLUMN IF NOT EXISTS image_url TEXT;
  END IF;
END $$;

-- ── Where uploads go ───────────────────────────────────────────────────────
-- Public, so the menu can show a picture without signing anything. 5 MB a file, images
-- only — the browser shrinks photos well under that before uploading anyway.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pictures', 'pictures', true, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anyone can look; only a signed-in admin can add, replace or remove. Without the second
-- half, the public key in every browser could fill the bucket with anything.
DROP POLICY IF EXISTS "Pictures are public" ON storage.objects;
DROP POLICY IF EXISTS "Admins upload pictures" ON storage.objects;
DROP POLICY IF EXISTS "Admins replace pictures" ON storage.objects;
DROP POLICY IF EXISTS "Admins remove pictures" ON storage.objects;

CREATE POLICY "Pictures are public" ON storage.objects FOR SELECT
  USING (bucket_id = 'pictures');
CREATE POLICY "Admins upload pictures" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pictures');
CREATE POLICY "Admins replace pictures" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'pictures') WITH CHECK (bucket_id = 'pictures');
CREATE POLICY "Admins remove pictures" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pictures');

NOTIFY pgrst, 'reload schema';

# Supabase Setup Guide — TEI Studio

Follow these steps once to connect a real backend so your edits persist globally (any device, any browser).

---

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (free account).
2. Click **New Project**, choose a name (e.g. `teistudio`), set a strong database password, and pick the region closest to you.
3. Wait ~1 minute for the project to spin up.

---

## 2. Get your credentials

In the Supabase dashboard:

1. Go to **Settings → API**
2. Copy:
   - **Project URL** → this is your `SUPABASE_URL`
   - **anon / public** key → this is your `SUPABASE_ANON_KEY`

Both are safe to publish — write access is protected by Row-Level Security.

---

## 3. Set up the database table

Go to **SQL Editor** in the Supabase dashboard and run:

```sql
-- Content table (stores all site text, project entries, testimonials)
CREATE TABLE site_content (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Allow public reads
ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON site_content
  FOR SELECT USING (true);

-- Allow authenticated (logged-in) users to write
CREATE POLICY "auth write" ON site_content
  FOR ALL USING (auth.role() = 'authenticated');
```

---

## 4. Set up the media storage bucket

Still in the SQL Editor:

```sql
-- Create public media bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public to read media
CREATE POLICY "public media read" ON storage.objects
  FOR SELECT USING (bucket_id = 'media');

-- Allow authenticated users to upload/update/delete media
CREATE POLICY "auth media write" ON storage.objects
  FOR ALL USING (bucket_id = 'media' AND auth.role() = 'authenticated');
```

---

## 5. Create your editor login

In the Supabase dashboard:

1. Go to **Authentication → Users**
2. Click **Add User → Create new user**
3. Enter your email address and choose a strong password
4. Click **Create User**

This is the password you'll type when pressing `Ctrl+Shift+E` on the site.

---

## 6. Update config.js

Open `js/config.js` and replace the placeholders:

```js
export const SUPABASE_URL      = 'https://YOUR_PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'your-anon-key-here';
export const OWNER_EMAIL       = 'your-email@example.com';
```

---

## 7. Deploy to GitHub Pages

1. Commit all files and push to your GitHub repository.
2. In GitHub: **Settings → Pages → Source: Deploy from a branch → main / root**
3. Your site will be live at `https://YOUR_USERNAME.github.io/TEISTUDIO/`

---

## How to use the editor

- **Open editor:** `Ctrl+Shift+E` on any page → enter your password
- **Edit text:** Click any text on the page and type (changes save on blur)
- **Upload hero image:** Hover over the home page hero in editor mode → click the overlay
- **Portfolio:** Use **+ Add Project** to add new projects with images; hover a card thumbnail to upload an image; use ✎ / × buttons to edit or delete
- **Testimonials:** Use **+ Add Testimonial** to add, ✎ to edit, × to delete
- **About photo:** Click the photo area on the About page to upload
- **WhatsApp number:** In editor mode, click any WhatsApp button → enter the number with country code (e.g. `60123456789` for Malaysia)
- **Exit editor:** `Ctrl+Shift+E` again, or click **Exit Editor** in the nav

---

## Changing the studio name

Search and replace `TEI Studio` across all HTML files with your friend's studio name.

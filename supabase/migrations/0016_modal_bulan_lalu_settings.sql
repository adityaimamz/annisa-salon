-- Migration 0016: Sederhanakan penyimpanan Modal Bulan Lalu (M)
-- Menggantikan ketergantungan pada hitungan laci harian dengan tabel app_settings sederhana

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Default Modal Bulan Lalu (M) Rp 148.000 (sesuai buku fisik salon Echa)
INSERT INTO public.app_settings (key, value)
VALUES ('modal_bulan_lalu', '148000')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value WHERE public.app_settings.value IS NULL;

-- RLS: Authenticated (owner & kasir) dapat membaca dan memperbarui
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_read" ON public.app_settings;
CREATE POLICY "app_settings_read" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "app_settings_write" ON public.app_settings;
CREATE POLICY "app_settings_write" ON public.app_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


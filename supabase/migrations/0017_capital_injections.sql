-- Migration 0017: Pencatatan Suntikan Modal & Dana Tambahan (Capital Injections)
-- Memfasilitasi input modal awal bulan dan modal tambahan dengan keterangan kategori yang jelas

CREATE TABLE IF NOT EXISTS public.capital_injections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  category text NOT NULL DEFAULT 'Modal Awal Bulan',
  note text,
  created_by text
);

-- RLS
ALTER TABLE public.capital_injections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "capital_injections_select" ON public.capital_injections;
CREATE POLICY "capital_injections_select" ON public.capital_injections
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "capital_injections_insert" ON public.capital_injections;
CREATE POLICY "capital_injections_insert" ON public.capital_injections
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "capital_injections_update" ON public.capital_injections;
CREATE POLICY "capital_injections_update" ON public.capital_injections
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "capital_injections_delete" ON public.capital_injections;
CREATE POLICY "capital_injections_delete" ON public.capital_injections
  FOR DELETE TO authenticated USING (true);

-- Data awal: Modal awal bulan November 2026 (Rp 148.000 sesuai buku catatan fisik salon)
INSERT INTO public.capital_injections (created_at, amount, category, note)
SELECT '2026-11-01 07:00:00+07', 148000, 'Modal Awal Bulan', 'Saldo sisa kas Oktober dibawa ke awal November (M = 148k)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.capital_injections WHERE category = 'Modal Awal Bulan' AND created_at >= '2026-11-01' AND created_at < '2026-11-02'
);


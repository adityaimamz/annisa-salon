-- Galeri "Hasil" di landing: foto, keterangan, kategori bebas, urutan. Hanya owner yang boleh mengubah.

create table public.gallery_photos (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  subtitle    text,
  alt         text,
  categories  text[] not null default '{}',
  image_url   text not null,   -- versi penuh (lightbox): path situs (/assets/...) atau URL Storage bucket gallery
  thumb_url   text not null,   -- versi kecil (grid)
  width       int,
  height      int,
  sort        int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.gallery_photos enable row level security;
create policy gallery_read  on public.gallery_photos for select using (active or public.is_staff());
create policy gallery_owner on public.gallery_photos for all using (public.is_owner()) with check (public.is_owner());

-- Bucket publik: hanya WebP, maks 1 MB per berkas (klien sudah mengompres jauh di bawah itu).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 1048576, array['image/webp'])
on conflict (id) do nothing;

create policy gallery_obj_read   on storage.objects for select using (bucket_id = 'gallery');
create policy gallery_obj_insert on storage.objects for insert with check (bucket_id = 'gallery' and public.is_owner());
create policy gallery_obj_update on storage.objects for update using (bucket_id = 'gallery' and public.is_owner());
create policy gallery_obj_delete on storage.objects for delete using (bucket_id = 'gallery' and public.is_owner());

-- Isi awal: 16 foto yang sebelumnya ditulis langsung di index.astro (berkas tetap di public/assets/foto).
insert into public.gallery_photos (title, subtitle, alt, categories, image_url, thumb_url, width, height, sort) values
 ('Bob silver ash',  'warna + potong',  'Potongan bob pendek warna silver ash',                    '{Warna,Potong}', '/assets/foto/silver-bob.webp',        '/assets/foto/silver-bob-sm.webp',        520, 693, 1),
 ('Smoothing',       'bob',             'Rambut bob hitam lurus mengkilap hasil smoothing',        '{Smoothing}',    '/assets/foto/smoothing-bob.webp',     '/assets/foto/smoothing-bob-sm.webp',     520, 693, 2),
 ('Coloring',        'tembaga',         'Rambut panjang warna tembaga mengkilap',                  '{Warna}',        '/assets/foto/copper-panjang.webp',    '/assets/foto/copper-panjang-sm.webp',    520, 693, 3),
 ('Eyebrow',         'rapikan alis',    'Alis yang sudah dirapikan dan dipertegas',                '{Alis}',         '/assets/foto/alis-2.webp',            '/assets/foto/alis-2-sm.webp',            520, 693, 4),
 ('Ombre bob',       'tampak belakang', 'Rambut bob ombre hitam ke pirang tampak belakang',        '{Warna,Potong}', '/assets/foto/ombre-bob.webp',         '/assets/foto/ombre-bob-sm.webp',         520, 693, 5),
 ('Smoothing',       'hitam natural',   'Rambut hitam lurus sebahu hasil smoothing',               '{Smoothing}',    '/assets/foto/smoothing-hitam.webp',   '/assets/foto/smoothing-hitam-sm.webp',   520, 693, 6),
 ('Manicure',        'marun',           'Kuku dicat warna merah marun',                            '{Kuku}',         '/assets/foto/kuku-marun.webp',        '/assets/foto/kuku-marun-sm.webp',        520, 693, 7),
 ('Highlight',       'pirang',          'Rambut dengan highlight pirang dari samping',             '{Warna}',        '/assets/foto/highlight.webp',         '/assets/foto/highlight-sm.webp',         520, 693, 8),
 ('Spa kids',        'massage + scrub', 'Kolase spa kids: anak sedang dipijat dan di-scrub, harga 65 ribu', '{"Spa kids"}', '/assets/foto/spa-kids.webp',  '/assets/foto/spa-kids-sm.webp',          520, 904, 9),
 ('Ombre bob',       'poni samping',    'Ombre bob dengan poni samping',                           '{Warna,Potong}', '/assets/foto/ombre-samping.webp',     '/assets/foto/ombre-samping-sm.webp',     520, 693, 10),
 ('Smoothing',       'panjang',         'Rambut hitam panjang lurus setelah treatment',            '{Smoothing}',    '/assets/foto/treatment-hitam.webp',   '/assets/foto/treatment-hitam-sm.webp',   520, 693, 11),
 ('Eyebrow',         'close-up',        'Close-up alis setelah dirapikan',                         '{Alis}',         '/assets/foto/alis-1.webp',            '/assets/foto/alis-1-sm.webp',            520, 770, 12),
 ('Coloring',        'tembaga',         'Rambut panjang warna tembaga tampak belakang',            '{Warna}',        '/assets/foto/copper-belakang.webp',   '/assets/foto/copper-belakang-sm.webp',   520, 693, 13),
 ('Ombre',           'madu',            'Ombre bob warna madu',                                    '{Warna,Potong}', '/assets/foto/ombre-madu.webp',        '/assets/foto/ombre-madu-sm.webp',        520, 693, 14),
 ('Potong layer',    'sebahu',          'Potongan layer sebahu dengan poni tipis',                 '{Potong}',       '/assets/foto/potong-layer.webp',      '/assets/foto/potong-layer-sm.webp',      520, 693, 15),
 ('Smoothing',       'panjang',         'Rambut panjang lurus hasil smoothing',                    '{Smoothing}',    '/assets/foto/smoothing-panjang.webp', '/assets/foto/smoothing-panjang-sm.webp', 520, 693, 16);

-- Daftar layanan di landing page sekarang dibaca dari catalog_items (satu sumber dengan Kasir).
-- Kolom description = deskripsi singkat yang tampil di website; boleh kosong.
-- Layanan dengan is_sample = true tampil sebagai "Tanya harga" di website sampai harganya dikonfirmasi.
alter table public.catalog_items add column description text;

update public.catalog_items set description = v.d
from (values
  ('smoothing',    'Rambut jadi lurus, jatuh, dan gampang diatur.'),
  ('coloring',     'Warna penuh, highlight, atau ombre.'),
  ('bleaching',    'Dasar untuk warna terang seperti pirang, madu, atau ash.'),
  ('potong',       'Layer, bob, poni, atau sekadar rapikan ujung.'),
  ('creambath',    'Krim rambut plus pijat kepala dan pundak.'),
  ('hairspa',      'Untuk rambut kering, kusam, atau habis diwarnai.'),
  ('facial-reg',   'Membersihkan komedo dan sisa makeup, ditutup masker.'),
  ('facial-detox', 'Pembersihan mendalam dengan alat detox. Untuk komedo, jerawat, minyak berlebih, dan pori-pori.'),
  ('facial-gbee',  'Untuk kulit wajah yang terlihat kusam.'),
  ('eyebrow',      'Alis dibentuk, dirapikan, dan dipertegas.'),
  ('lulur',        'Mengangkat kulit mati, kulit lebih halus.'),
  ('massage',      'Pijat seluruh badan untuk yang pegal-pegal.'),
  ('whitening',    'Perawatan untuk mencerahkan kulit badan.'),
  ('mani',         'Kuku tangan dibersihkan, dibentuk, dan diwarnai.'),
  ('pedi',         'Sama, untuk kuku kaki.'),
  ('nailart',      'Bawa contoh motif yang kamu suka.'),
  ('spakids',      'Body massage dan scrub khusus anak. Bisa sambil ibunya perawatan.')
) as v(id, d)
where public.catalog_items.id = v.id;

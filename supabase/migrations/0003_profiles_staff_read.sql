-- Staf boleh membaca nama sesama staf (untuk menampilkan nama kasir di struk).
-- Hanya SELECT; mengubah profil/peran tetap hanya untuk owner.
drop policy profiles_self_read on public.profiles;
create policy profiles_staff_read on public.profiles for select using (public.is_staff());

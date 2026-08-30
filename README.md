# BOT WHATSAPP – PORTAL PENGADUAN & ASPIRASI MASYARAKAT
## YONIF TP 953/HARIMAU RAWA

Bot menggunakan WhatsApp Web melalui Baileys dan QR Code. Tidak menggunakan WhatsApp Cloud API.

## Fitur
- Pesan apa pun dari pengguna memunculkan pesan pembuka.
- Daftar layanan hanya muncul setelah pengguna mengetik `MENU`.
- Menu 01–08.
- 01 Pengaduan dengan alur otomatis dan nomor tiket.
- 02 Sinergi & Aspirasi.
- 03 Informasi.
- 04 Cek Status menggunakan nomor tiket.
- 05 Hubungi Petugas.
- 06 Tentang Portal.
- 07 Keadaan Darurat dengan peringatan bahwa bot bukan pengganti layanan darurat resmi.
- 08 Pengawasan Anggota dengan alur 6 tahap:
  1. Nama pelapor
  2. Waktu dan lokasi kejadian
  3. Nama/identitas anggota apabila diketahui
  4. Uraian kejadian
  5. Bukti pendukung
  6. Nomor yang dapat dihubungi
- Konfirmasi sebelum laporan disimpan.
- Database JSON di `data/pengaduan.json`.
- Bukti foto/dokumen media disimpan di `data/bukti/`.
- Perintah `MENU` dan `BATAL` tersedia kapan saja.

## Instalasi
Pastikan Node.js LTS sudah terpasang.

```bash
npm install
npm start
```

Saat QR muncul di terminal:
1. Buka WhatsApp pada HP akun bot.
2. Pilih **Perangkat tertaut**.
3. Pilih **Tautkan perangkat**.
4. Scan QR di terminal.

## Alur
Pesan apa pun → Pesan Pembuka → pengguna mengetik `MENU` → Menu 01–08 → pilih layanan → proses otomatis.

## Catatan keamanan
Jangan membagikan folder `auth_info` karena berisi kredensial sesi WhatsApp. Folder tersebut dibuat setelah login pertama.

Layanan `07` bukan pengganti layanan darurat resmi. Dalam keadaan yang mengancam keselamatan, pengguna harus menghubungi layanan darurat/instansi terkait secara langsung.

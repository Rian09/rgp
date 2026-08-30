const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'pengaduan.json');
const MEDIA_DIR = path.join(DATA_DIR, 'bukti');
fs.mkdirSync(MEDIA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

const sessions = new Map();
const readDB = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '[]');
const writeDB = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

const opening = `*🇮🇩 SELAMAT DATANG DI PORTAL PENGADUAN DAN ASPIRASI MASYARAKAT\nYONIF TP 953/HARIMAU RAWA 🇮🇩*\n\nPortal ini merupakan sarana komunikasi masyarakat untuk menyampaikan laporan, pengaduan, informasi, serta aspirasi. Kami akan menerima dan menindaklanjutinya sesuai ketentuan yang berlaku\n\n*Apakah ada yang bisa kami bantu?*\n\nSilakan pilih layanan yang Anda perlukan: *MENU*`;

const menu = `🇮🇩 *PORTAL PELAYANAN MASYARAKAT* 🇮🇩\n*YONIF TP 953/HARIMAU RAWA*\n\n━━━━━━━━━━━━━━━━━━━━━━\n        *LAYANAN DIGITAL*\n━━━━━━━━━━━━━━━━━━━━━━\n\n*01 | PENGADUAN*\nMenyampaikan laporan atau pengaduan untuk mendapatkan tindak lanjut.\n\n*02 | SINERGI & ASPIRASI*\nMenyampaikan saran, masukan, aspirasi, serta membangun komunikasi dan sinergi bersama masyarakat.\n\n*03 | INFORMASI*\nMendapatkan informasi mengenai layanan dan ketentuan yang tersedia.\n\n*04 | CEK STATUS*\nMemeriksa perkembangan dan status pengaduan yang telah disampaikan.\n\n*05 | HUBUNGI PETUGAS*\nMenghubungi petugas untuk mendapatkan bantuan atau informasi lebih lanjut.\n\n*06 | TENTANG PORTAL*\nInformasi mengenai Portal Pengaduan dan Aspirasi Masyarakat.\n\n*07 | KEADAAN DARURAT*\nMenyampaikan informasi mengenai situasi darurat yang membutuhkan perhatian segera.\n\n*08 | PENGAWASAN ANGGOTA*\nMenyampaikan informasi atau laporan terkait anggota sesuai ketentuan yang berlaku.\n\n━━━━━━━━━━━━━━━━━━━━━━\n*PETUNJUK*\nKetik *01–08* sesuai layanan yang Anda perlukan.\n\nKetik *MENU* kapan saja untuk kembali ke menu utama.\nKetik *BATAL* untuk membatalkan proses.`;

function newTicket() {
  const year = new Date().getFullYear();
  const db = readDB();
  let n = db.length + 1;
  let ticket;
  do { ticket = `PGA-${year}-${String(n++).padStart(4, '0')}`; } while (db.some(x => x.ticket === ticket));
  return ticket;
}

function normalize(text) { return String(text || '').trim().toLowerCase(); }
function getText(message) {
  return message?.conversation || message?.extendedTextMessage?.text || message?.imageMessage?.caption || message?.documentMessage?.caption || '';
}
function hasMedia(message) { return !!(message?.imageMessage || message?.documentMessage || message?.videoMessage); }

async function saveEvidence(sock, message, ticket) {
  if (!hasMedia(message)) return null;
  try {
    const buffer = await downloadMediaMessage(message, 'buffer', {}, { logger: P({ level: 'silent' }) });
    const ext = message.imageMessage ? 'jpg' : message.videoMessage ? 'mp4' : 'bin';
    const file = path.join(MEDIA_DIR, `${ticket}-${Date.now()}.${ext}`);
    fs.writeFileSync(file, buffer);
    return path.relative(__dirname, file);
  } catch (e) {
    console.error('Gagal menyimpan bukti:', e.message);
    return null;
  }
}

async function send(sock, jid, text) { return sock.sendMessage(jid, { text }); }

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info'));
  const sock = makeWASocket({ auth: state, logger: P({ level: 'silent' }), printQRInTerminal: false, markOnlineOnConnect: false });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) { console.log('\nScan QR berikut melalui WhatsApp > Perangkat tertaut > Tautkan perangkat:\n'); qrcode.generate(qr, { small: true }); }
    if (connection === 'open') console.log('✓ BOT TERHUBUNG');
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) { console.log('Koneksi terputus. Menghubungkan kembali...'); start().catch(console.error); }
      else console.log('Sesi WhatsApp logout. Hapus folder auth_info lalu jalankan kembali.');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages) {
      try {
        if (!m?.message || m.key.fromMe || m.key.remoteJid?.endsWith('@g.us')) continue;
        const jid = m.key.remoteJid;
        const rawText = getText(m.message);
        const cmd = normalize(rawText);
        const session = sessions.get(jid);

        if (cmd === 'batal' || cmd === 'cancel') { sessions.delete(jid); await send(sock, jid, '✅ Proses dibatalkan.\n\nKetik *MENU* untuk melihat layanan.'); continue; }
        if (cmd === 'menu') { sessions.delete(jid); await send(sock, jid, menu); continue; }

        if (!session) { await send(sock, jid, opening); continue; }
        await handleSession(sock, jid, m, rawText, session);
      } catch (e) { console.error('Message error:', e); }
    }
  });
}

async function handleSession(sock, jid, message, text, s) {
  const cmd = normalize(text);

  if (s.type === 'status') {
    const found = readDB().find(x => x.ticket.toLowerCase() === cmd);
    sessions.delete(jid);
    if (!found) return send(sock, jid, `❌ Nomor tiket *${text}* tidak ditemukan.\n\nKetik *04* setelah membuka MENU untuk mencoba lagi.`);
    return send(sock, jid, `🔎 *STATUS PENGADUAN*\n\n🎫 Nomor Tiket: *${found.ticket}*\n📌 Status: *${found.status}*\n🕐 Diterima: ${found.createdAt}\n\nTerima kasih telah menggunakan layanan kami.`);
  }

  if (s.type === 'pengaduan') return handlePengaduan(sock, jid, text, s);
  if (s.type === 'aspirasi') return handleAspirasi(sock, jid, text, s);
  if (s.type === 'petugas') { sessions.delete(jid); return send(sock, jid, `👮 *HUBUNGI PETUGAS*\n\nPesan Anda telah diterima sebagai permintaan komunikasi.\n\n📝 *Pesan:* ${text}\n\nPetugas dapat menindaklanjuti sesuai ketersediaan dan ketentuan layanan.\n\nKetik *MENU* untuk kembali.`); }
  if (s.type === 'pengawasan') return handlePengawasan(sock, jid, message, text, s);
  if (s.type === 'info') { sessions.delete(jid); return send(sock, jid, `ℹ️ *INFORMASI LAYANAN*\n\nPertanyaan Anda:\n${text}\n\nSilakan gunakan *MENU* untuk memilih layanan lainnya.`); }
}

async function handlePengaduan(sock, jid, text, s) {
  if (s.step === 1) { s.data.uraian = text; s.step = 2; return send(sock, jid, '*PENGADUAN — 2/4*\n\nSilakan tuliskan *lokasi dan waktu kejadian*.'); }
  if (s.step === 2) { s.data.waktuLokasi = text; s.step = 3; return send(sock, jid, '*PENGADUAN — 3/4*\n\nApakah ada bukti pendukung? Jika ada, kirim foto/dokumen. Jika tidak ada, ketik *TIDAK ADA*.'); }
  if (s.step === 3) { s.data.bukti = text; s.step = 4; return send(sock, jid, '*PENGADUAN — 4/4*\n\nSilakan masukkan *nomor yang dapat dihubungi*.'); }
  if (s.step === 4) { s.data.nomor = text; return confirmAndSave(sock, jid, s, 'Pengaduan'); }
}

async function handleAspirasi(sock, jid, text, s) {
  if (s.step === 1) { s.data.isi = text; s.step = 2; return send(sock, jid, '*SINERGI & ASPIRASI — 2/3*\n\nSilakan tuliskan nama/kelompok/instansi yang menyampaikan aspirasi, bila diperlukan.'); }
  if (s.step === 2) { s.data.pengusul = text; s.step = 3; return send(sock, jid, '*SINERGI & ASPIRASI — 3/3*\n\nSilakan masukkan nomor yang dapat dihubungi (atau ketik *TIDAK ADA*).'); }
  if (s.step === 3) { s.data.nomor = text; return confirmAndSave(sock, jid, s, 'Sinergi & Aspirasi'); }
}

async function handlePengawasan(sock, jid, message, text, s) {
  if (s.step === 1) { s.data.namaPelapor = text; s.step = 2; return send(sock, jid, '*PENGAWASAN ANGGOTA — 2/6*\n\nSilakan tuliskan *waktu dan lokasi kejadian*.'); }
  if (s.step === 2) { s.data.waktuLokasi = text; s.step = 3; return send(sock, jid, '*PENGAWASAN ANGGOTA — 3/6*\n\nSilakan tuliskan *nama atau identitas anggota, apabila diketahui*.\n\nJika tidak diketahui, ketik *TIDAK DIKETAHUI*.'); }
  if (s.step === 3) { s.data.identitasAnggota = text; s.step = 4; return send(sock, jid, '*PENGAWASAN ANGGOTA — 4/6*\n\nSilakan jelaskan *uraian kejadian* secara jelas dan kronologis.'); }
  if (s.step === 4) { s.data.uraian = text; s.step = 5; return send(sock, jid, '*PENGAWASAN ANGGOTA — 5/6*\n\n📎 *Bukti Pendukung*\nJika ada, silakan kirim foto/dokumen yang relevan. Jika tidak ada, ketik *TIDAK ADA*.'); }
  if (s.step === 5) {
    if (hasMedia(message)) s.data.bukti = 'Akan disimpan setelah tiket dibuat';
    else s.data.bukti = text;
    s.step = 6;
    return send(sock, jid, '*PENGAWASAN ANGGOTA — 6/6*\n\nSilakan masukkan *nomor yang dapat dihubungi*.');
  }
  if (s.step === 6) {
    s.data.nomor = text;
    s.pendingEvidence = hasMedia(message) ? message : null;
    return confirmAndSave(sock, jid, s, 'Pengawasan Anggota');
  }
  if (s.step === 7) {
    if (['1', 'ya', 'kirim', 'setuju'].includes(normalize(text))) return saveSession(sock, jid, s);
    if (['2', 'tidak', 'perbaiki'].includes(normalize(text))) { s.step = 1; s.data = {}; s.pendingEvidence = null; return send(sock, jid, 'Baik. Data dihapus dari proses ini.\n\n*1/6 — NAMA PELAPOR*\nSilakan ketik nama pelapor.'); }
    if (['0', 'batal'].includes(normalize(text))) { sessions.delete(jid); return send(sock, jid, 'Proses dibatalkan. Ketik *MENU* untuk kembali.'); }
    return send(sock, jid, 'Pilihan tidak dikenali. Ketik *1* untuk KIRIM, *2* untuk PERBAIKI, atau *0* untuk BATAL.');
  }
}

async function confirmAndSave(sock, jid, s, jenis) {
  s.data.jenis = jenis;
  s.data.ticket = newTicket();
  s.data.status = 'Diterima';
  s.data.createdAt = new Date().toLocaleString('id-ID');
  s.step = 7;
  const d = s.data;
  let summary = `📋 *KONFIRMASI ${jenis.toUpperCase()}*\n\n`;
  if (jenis === 'Pengawasan Anggota') summary += `👤 *Nama Pelapor:* ${d.namaPelapor}\n🕐 *Waktu & Lokasi:* ${d.waktuLokasi}\n👮 *Identitas Anggota:* ${d.identitasAnggota}\n📝 *Uraian:* ${d.uraian}\n📎 *Bukti:* ${d.bukti}\n📞 *Nomor:* ${d.nomor}\n`;
  else if (jenis === 'Pengaduan') summary += `📝 *Uraian:* ${d.uraian}\n🕐 *Waktu & Lokasi:* ${d.waktuLokasi}\n📎 *Bukti:* ${d.bukti}\n📞 *Nomor:* ${d.nomor}\n`;
  else summary += `💬 *Aspirasi:* ${d.isi}\n👤 *Pengusul:* ${d.pengusul}\n📞 *Nomor:* ${d.nomor}\n`;
  summary += `\nApakah data tersebut sudah benar?\n\n*1* — KIRIM LAPORAN\n*2* — PERBAIKI DATA\n*0* — BATAL`;
  return send(sock, jid, summary);
}

async function saveSession(sock, jid, s) {
  const arr = readDB();
  const item = { ...s.data };
  if (s.pendingEvidence) {
    item.buktiFile = await saveEvidence(sock, s.pendingEvidence, item.ticket);
    item.bukti = item.buktiFile ? 'File bukti tersimpan' : item.bukti;
  }
  arr.push(item);
  writeDB(arr);
  sessions.delete(jid);
  return send(sock, jid, `✅ *LAPORAN BERHASIL DITERIMA*\n\nInformasi Anda telah berhasil diterima dan tercatat dalam sistem.\n\n🎫 *Nomor Tiket:* *${item.ticket}*\n📌 *Status:* *Diterima*\n\nSimpan nomor tiket tersebut untuk mengecek perkembangan laporan melalui *04 — CEK STATUS*.\n\n🇮🇩 *YONIF TP 953/HARIMAU RAWA*`);
}

start().catch(console.error);

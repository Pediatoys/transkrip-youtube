# NoteTube (TranskripAI) - YouTube Transcript Generator & AI Summarizer

Aplikasi web modern untuk mengekstrak transkrip dari video YouTube secara instan dengan sinkronisasi timestamp interaktif, ringkasan berbasis AI (Gemini / OpenAI / Built-in Engine), dan ekspor dalam format SRT, TXT, Markdown, dan JSON.

Dibuat terinspirasi dari fitur NoteGPT dengan desain antarmuka modern yang responsif dan elegan.

---

## 🚀 Fitur Utama

- ⚡ **Ekstraksi Subtitle Instan**: Mendukung URL video standar, shortlinks (`youtu.be`), dan YouTube Shorts.
- ⏱️ **Interactive Click-to-Seek**: Klik pada timestamp baris manapun untuk melompatkan pemutar video ke detik tersebut.
- 🎯 **Auto-Sync & Highlighting**: Baris transkrip yang sedang diputar akan menyala (*highlight*) dan otomatis di-scroll mengikuti durasi video.
- 🔍 **Pencarian Cepat**: Filter teks dalam transkrip secara real-time dengan penanda kata kunci (*keyword highlight*).
- 🧠 **AI Summarization**:
  - **Executive Summary**: Intisari ringkas isi video.
  - **Key Takeaways**: Poin-poin penting dan kesimpulan terstruktur.
  - **Mind Map**: Struktur hierarki konsep video.
  - **Chapters**: Garis besar pembagian bab waktu video.
- 💬 **Tanya Video (Interactive Q&A)**: Bertanya langsung kepada AI mengenai isi materi video.
- 🌐 **Multi-Language Subtitle**: Beralih antar bahasa subtitle yang tersedia pada video.
- 💾 **Ekspor Fleksibel**:
  - Salin teks bersih (tanpa timestamp) atau salin dengan timestamp.
  - Unduh sebagai `.srt` (file subtitle untuk pemutar video seperti VLC/Premiere).
  - Unduh sebagai `.txt`, `.md` (Markdown), atau `.json`.
- 🌓 **Dark & Light Mode**: Desain modern dengan dukungan tema gelap dan terang.
- 🆓 **Bisa Berjalan 100% Gratis**: Dilengkapi Built-in Smart Summarizer tanpa wajib memasukkan API Key.

---

## 🛠️ Cara Menjalankan

### Cara Cepat (Windows):
Cukup klik ganda file **`run.bat`**. Server akan otomatis menyala dan browser akan terbuka di `http://localhost:8088`.

### Melalui Terminal:
```bash
# 1. Masuk ke direktori proyek
cd d:\www\transkrip

# 2. Jalankan server Python
python server.py
```
Buka browser di [http://localhost:8088](http://localhost:8088).

---

## 🔑 Pengaturan AI (Opsional)
Aplikasi sudah dapat digunakan langsung secara gratis dengan *Built-in Smart Engine*. Jika ingin menggunakan model AI yang lebih cerdas:
1. Klik tombol **Pengaturan** di pojok kanan atas aplikasi.
2. Masukkan **Gemini API Key** (gratis di [Google AI Studio](https://aistudio.google.com/)) atau **OpenAI API Key**.
3. Klik **Simpan Pengaturan**. Key disimpan secara lokal di browser Anda.

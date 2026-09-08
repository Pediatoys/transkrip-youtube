import os
import sys
import re
import json
import tempfile
import glob

# Ensure stdout handles UTF-8 on Windows
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

import httpx
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
    IpBlocked
)

app = FastAPI(title="NoteTube - YouTube Transcript Generator & AI Summarizer")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helpers for Video ID extraction
def extract_video_id(url_or_id: str) -> Optional[str]:
    url_or_id = url_or_id.strip()
    # If already a valid 11-char ID
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", url_or_id):
        return url_or_id

    patterns = [
        r"(?:v=|\/v\/|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})",
        r"^([A-Za-z0-9_-]{11})$",
    ]
    for pattern in patterns:
        match = re.search(pattern, url_or_id)
        if match:
            return match.group(1)
    return None

async def fetch_video_metadata(video_id: str) -> dict:
    oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(oembed_url)
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "title": data.get("title", f"YouTube Video ({video_id})"),
                    "author": data.get("author_name", "Unknown Channel"),
                    "author_url": data.get("author_url", ""),
                    "thumbnail_url": data.get("thumbnail_url", f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"),
                }
    except Exception as e:
        print("oEmbed error:", e)
    
    return {
        "title": f"YouTube Video ({video_id})",
        "author": "YouTube Creator",
        "author_url": f"https://www.youtube.com/watch?v={video_id}",
        "thumbnail_url": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
    }

# Data Models
class TranscriptItem(BaseModel):
    start: float
    duration: float
    text: str

class SummarizeRequest(BaseModel):
    transcript: List[TranscriptItem]
    title: Optional[str] = "Video"
    mode: Optional[str] = "summary" # summary | takeaways | chapters | mindmap
    language: Optional[str] = "id" # id | en
    api_key: Optional[str] = None
    provider: Optional[str] = "gemini" # gemini | openai

class ChatRequest(BaseModel):
    transcript: List[TranscriptItem]
    title: Optional[str] = "Video"
    question: str
    language: Optional[str] = "id"
    api_key: Optional[str] = None
    provider: Optional[str] = "gemini"

class TranscribeAudioRequest(BaseModel):
    video_id: str
    api_key: Optional[str] = None
    provider: Optional[str] = "groq" # groq | openai
    language: Optional[str] = None

import html

# Format seconds to MM:SS or HH:MM:SS
def format_time(seconds: float) -> str:
    s = int(seconds)
    m, s = divmod(s, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"

def clean_cue_text(text: str) -> str:
    if not text:
        return ""
    # Unescape HTML entities (e.g. &#39; -> ')
    text = html.unescape(text)
    # Remove bracketed sound effects/noise like [Music], [Musik], [Applause], [Tepuk tangan], [Tawa], [Laughter], [Cheering], [Sorak], [Sound effect], [Audio], [Intro], [Outro], [Hening], [Silence], [Inaudible], [Unintelligible], etc.
    text = re.sub(
        r'\[\s*(?:music|musik|applause|tepuk tangan|tawa|laughter|cheering|sorak|sound effect|audio|suara musik|suara|intro|outro|hening|silence|inaudible|unintelligible|subtitles by|terjemahan oleh)[\s\w.:-]*\]',
        '',
        text,
        flags=re.IGNORECASE
    )
    # Generic sound effect bracket if single word like [Sigh], [Gasp], [Noise]
    text = re.sub(r'\[\s*(?:sigh|gasp|noise|cough|batuk|bersin|snort|screaming|shouting)[\s\w]*\]', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\(\s*(?:music|musik|applause|laughter|tawa|cheering)[\s\w]*\)', '', text, flags=re.IGNORECASE)
    # Remove musical note symbols
    text = re.sub(r'[♪♫♩♬]+', '', text)
    # Clean multiple spaces
    text = re.sub(r'\s+', ' ', text).strip()
    return text

clean_subtitle_noise = clean_cue_text

def group_into_paragraphs(transcript_data: list, pause_threshold: float = 1.2, max_words: int = 42) -> list:
    paragraphs = []
    if not transcript_data:
        return paragraphs
    
    current_p = {
        "start": transcript_data[0]["start"],
        "end": transcript_data[0]["start"] + transcript_data[0]["duration"],
        "texts": [],
        "cues": []
    }
    
    for item in transcript_data:
        clean = clean_cue_text(item["text"])
        if not clean:
            continue
        
        pause = 0
        if current_p["cues"]:
            last_end = current_p["cues"][-1]["start"] + current_p["cues"][-1]["duration"]
            pause = item["start"] - last_end
        
        current_word_count = sum(len(t.split()) for t in current_p["texts"])
        ends_with_terminal = bool(re.search(r'[.?!]$', clean))
        
        # Split conditions:
        # 1. Natural speech pause (>= 2.0s unconditionally, or >= 1.2s if current chunk has >= 12 words)
        # 2. Current paragraph exceeds max_words (default 42 words)
        # 3. Sentence terminal (. ? !) with decent size (>= 18 words)
        should_split = False
        if current_p["texts"]:
            if pause >= 2.0:
                should_split = True
            elif pause >= pause_threshold and current_word_count >= 12:
                should_split = True
            elif current_word_count >= max_words:
                should_split = True
            elif ends_with_terminal and current_word_count >= 18:
                should_split = True
                
        if should_split:
            p_text = " ".join(current_p["texts"]).strip()
            if p_text:
                p_text = p_text[0].upper() + p_text[1:]
                if not re.search(r'[.?!]$', p_text):
                    p_text += "."
                idx = len(paragraphs)
                paragraphs.append({
                    "id": f"p-{idx}",
                    "start": round(current_p["start"], 2),
                    "end": round(current_p["end"], 2),
                    "formatted_start": format_time(current_p["start"]),
                    "formatted_end": format_time(current_p["end"]),
                    "text": p_text,
                    "word_count": len(p_text.split()),
                    "cue_count": len(current_p["cues"])
                })
            current_p = {
                "start": item["start"],
                "end": item["start"] + item["duration"],
                "texts": [clean],
                "cues": [item]
            }
        else:
            current_p["texts"].append(clean)
            current_p["cues"].append(item)
            current_p["end"] = item["start"] + item["duration"]

    if current_p["texts"]:
        p_text = " ".join(current_p["texts"]).strip()
        if p_text:
            p_text = p_text[0].upper() + p_text[1:]
            if not re.search(r'[.?!]$', p_text):
                p_text += "."
            idx = len(paragraphs)
            paragraphs.append({
                "id": f"p-{idx}",
                "start": round(current_p["start"], 2),
                "end": round(current_p["end"], 2),
                "formatted_start": format_time(current_p["start"]),
                "formatted_end": format_time(current_p["end"]),
                "text": p_text,
                "word_count": len(p_text.split()),
                "cue_count": len(current_p["cues"])
            })
            
    return paragraphs

# Built-in Heuristic Summarizer (Runs 100% offline without API key!)
def generate_heuristic_summary(transcript: List[TranscriptItem], title: str, mode: str, language: str = "id") -> str:
    if not transcript:
        return "Transkrip kosong." if language == "id" else "Empty transcript."

    full_text = " ".join(t.text for t in transcript)
    total_words = len(full_text.split())
    total_time = transcript[-1].start + transcript[-1].duration
    time_str = format_time(total_time)

    # Divide transcript into segments
    num_segments = min(6, max(3, int(total_time // 180) or 3))
    segment_duration = total_time / num_segments
    chapters = []

    for i in range(num_segments):
        seg_start = i * segment_duration
        seg_end = (i + 1) * segment_duration
        seg_items = [t for t in transcript if seg_start <= t.start < seg_end]
        if not seg_items:
            continue
        seg_text = " ".join(t.text for t in seg_items)
        
        # Pick prominent phrases / sentences
        sentences = [s.strip() for s in re.split(r'[.\n?!]+', seg_text) if len(s.strip()) > 15]
        summary_sentence = sentences[0] if sentences else (seg_items[0].text if seg_items else "")
        if len(sentences) > 1 and len(summary_sentence) < 40:
            summary_sentence += ". " + sentences[1]
            
        timestamp_label = format_time(seg_items[0].start)
        chapters.append({
            "time": timestamp_label,
            "seconds": seg_items[0].start,
            "summary": summary_sentence[:180] + ("..." if len(summary_sentence) > 180 else "")
        })

    if language == "id":
        if mode == "takeaways":
            output = f"### 💡 Poin-Poin Kunci (Key Takeaways)\n\n"
            output += f"Berikut intisari penting dari video **{title}** (Durasi: {time_str}, ~{total_words} kata):\n\n"
            for i, ch in enumerate(chapters, 1):
                output += f"- **[{ch['time']}] Poin #{i}**: {ch['summary']}\n"
            output += "\n> 💡 *Catatan: Anda dapat memasukkan Gemini atau OpenAI API Key pada menu Pengaturan untuk analisis AI yang lebih mendalam.*"
            return output

        elif mode == "chapters":
            output = f"### ⏱️ Bab & Garis Besar Waktu (Chapters)\n\n"
            for ch in chapters:
                output += f"- **[{ch['time']}]** {ch['summary']}\n"
            return output

        elif mode == "mindmap":
            output = f"### 🧠 Konsep & Struktur Video\n\n```text\n"
            output += f"📌 {title}\n"
            for ch in chapters:
                output += f"  ├── [{ch['time']}] {ch['summary'][:60]}...\n"
            output += f"  └── Selesai ({time_str})\n```"
            return output

        else: # summary
            output = f"### 📝 Ringkasan Eksekutif: {title}\n\n"
            output += f"Video ini berdurasi sekitar **{time_str}** dengan total **{total_words} kata** dalam transkrip.\n\n"
            output += "#### 📌 Ringkasan Alur Pembahasan:\n"
            for ch in chapters:
                output += f"1. **Menit {ch['time']}**: {ch['summary']}\n"
            output += f"\n#### 🎯 Kesimpulan Singkat:\nVideo ini menyajikan pembahasan menyeluruh terkait topik di atas. Gunakan tab **Chapters** atau **Transkrip** untuk melompat langsung ke bagian yang relevan."
            output += "\n\n*(Didukung oleh Built-in Smart Summarizer. Masukkan Gemini API Key untuk penjelasan custom berstandar tinggi)*"
            return output

    else: # English
        if mode == "takeaways":
            output = f"### 💡 Key Takeaways\n\n"
            output += f"Key highlights from **{title}** (Duration: {time_str}, ~{total_words} words):\n\n"
            for i, ch in enumerate(chapters, 1):
                output += f"- **[{ch['time']}] Takeaway #{i}**: {ch['summary']}\n"
            return output
        elif mode == "chapters":
            output = f"### ⏱️ Timestamped Chapters\n\n"
            for ch in chapters:
                output += f"- **[{ch['time']}]** {ch['summary']}\n"
            return output
        else:
            output = f"### 📝 Executive Summary: {title}\n\n"
            output += f"This video runs for **{time_str}** with approximately **{total_words} words** in the transcript.\n\n"
            output += "#### 📌 Discussion Highlights:\n"
            for ch in chapters:
                output += f"1. **[{ch['time']}]**: {ch['summary']}\n"
            return output

# --- API Endpoints ---

@app.get("/api/transcript")
async def get_transcript(
    url: str = Query(..., description="YouTube URL or video ID"),
    lang: Optional[str] = Query(None, description="Preferred language code")
):
    video_id = extract_video_id(url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Format URL YouTube tidak valid atau Video ID tidak ditemukan.")

    # 1. Fetch metadata
    meta = await fetch_video_metadata(video_id)

    # 2. Fetch transcript via youtube_transcript_api
    try:
        ytt = YouTubeTranscriptApi()
        transcript_list = ytt.list(video_id)
        
        available_languages = []
        target_transcript = None

        for t in transcript_list:
            available_languages.append({
                "code": t.language_code,
                "name": t.language,
                "is_generated": t.is_generated,
            })
            if lang and t.language_code == lang:
                target_transcript = t

        # If requested lang not found or not specified, pick the best track
        if not target_transcript:
            # Prefer manual subtitle over auto-generated if available
            manual_tracks = [t for t in transcript_list if not t.is_generated]
            if manual_tracks:
                # If there's an indonesian or english manual track, pick it
                target_transcript = next((t for t in manual_tracks if t.language_code in ['id', 'en']), manual_tracks[0])
            else:
                tracks = list(transcript_list)
                target_transcript = next((t for t in tracks if t.language_code in ['id', 'en']), tracks[0])

        raw_snippets = target_transcript.fetch()
        transcript_data = [
            {
                "start": round(s.start if hasattr(s, "start") else s["start"], 2),
                "duration": round(s.duration if hasattr(s, "duration") else s.get("duration", 0), 2),
                "text": (s.text if hasattr(s, "text") else s["text"]).replace("\n", " ").strip()
            }
            for s in raw_snippets
        ]

        total_words = sum(len(item["text"].split()) for item in transcript_data)
        total_duration = transcript_data[-1]["start"] + transcript_data[-1]["duration"] if transcript_data else 0

        return {
            "video_id": video_id,
            "title": meta["title"],
            "author": meta["author"],
            "author_url": meta["author_url"],
            "thumbnail_url": meta["thumbnail_url"],
            "selected_language": target_transcript.language_code,
            "language_name": target_transcript.language,
            "is_generated": target_transcript.is_generated,
            "available_languages": available_languages,
            "transcript": transcript_data,
            "paragraphs": group_into_paragraphs(transcript_data),
            "total_items": len(transcript_data),
            "total_words": total_words,
            "total_duration": round(total_duration, 2),
            "formatted_duration": format_time(total_duration)
        }

    except TranscriptsDisabled:
        raise HTTPException(
            status_code=404, 
            detail={
                "message": "Transkrip / Subtitle dinonaktifkan oleh pemilik video ini di YouTube.",
                "can_whisper": True,
                "video_id": video_id
            }
        )
    except NoTranscriptFound:
        raise HTTPException(
            status_code=404, 
            detail={
                "message": "Tidak ada transkrip / subtitle bawaan yang ditemukan untuk video ini.",
                "can_whisper": True,
                "video_id": video_id
            }
        )
    except VideoUnavailable:
        raise HTTPException(status_code=404, detail={"message": "Video YouTube tidak tersedia atau bersifat privat."})
    except IpBlocked:
        raise HTTPException(status_code=429, detail={"message": "Permintaan sementara dibatasi oleh YouTube. Silakan coba beberapa saat lagi."})
    except Exception as e:
        # Fallback to direct fetch if list() failed
        try:
            raw_snippets = ytt.fetch(video_id)
            transcript_data = [
                {
                    "start": round(s.start if hasattr(s, "start") else s["start"], 2),
                    "duration": round(s.duration if hasattr(s, "duration") else s.get("duration", 0), 2),
                    "text": (s.text if hasattr(s, "text") else s["text"]).replace("\n", " ").strip()
                }
                for s in raw_snippets
            ]
            total_duration = transcript_data[-1]["start"] + transcript_data[-1]["duration"] if transcript_data else 0
            return {
                "video_id": video_id,
                "title": meta["title"],
                "author": meta["author"],
                "author_url": meta["author_url"],
                "thumbnail_url": meta["thumbnail_url"],
                "selected_language": "auto",
                "language_name": "Automatic",
                "is_generated": True,
                "available_languages": [{"code": "auto", "name": "Automatic", "is_generated": True}],
                "transcript": transcript_data,
                "paragraphs": group_into_paragraphs(transcript_data),
                "total_items": len(transcript_data),
                "total_words": sum(len(item["text"].split()) for item in transcript_data),
                "total_duration": round(total_duration, 2),
                "formatted_duration": format_time(total_duration)
            }
        except Exception as e2:
            raise HTTPException(
                status_code=500, 
                detail={
                    "message": f"Gagal mengambil transkrip: {str(e2)}",
                    "can_whisper": True,
                    "video_id": video_id
                }
            )

@app.post("/api/transcribe-audio")
async def transcribe_audio_whisper(req: TranscribeAudioRequest):
    video_id = extract_video_id(req.video_id)
    if not video_id:
        raise HTTPException(status_code=400, detail="Video ID tidak valid.")

    api_key = req.api_key or os.environ.get("GROQ_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Kunci API dibutuhkan untuk Whisper. Silakan masukkan Groq API Key gratis (dari console.groq.com) atau OpenAI API Key di menu Pengaturan."
        )

    provider = req.provider or ("openai" if (api_key.startswith("sk-") and not api_key.startswith("gsk_")) else "groq")

    # 1. Fetch metadata
    meta = await fetch_video_metadata(video_id)

    # 2. Extract audio via yt-dlp
    import yt_dlp
    temp_dir = tempfile.gettempdir()
    out_prefix = os.path.join(temp_dir, f"yt_whisper_{video_id}")
    out_tmpl = f"{out_prefix}.%(ext)s"

    # Clean old files
    for old_file in glob.glob(f"{out_prefix}.*"):
        try:
            os.remove(old_file)
        except Exception:
            pass

    ydl_opts = {
        'format': 'ba[ext=m4a]/ba[ext=mp3]/ba/b',
        'outtmpl': out_tmpl,
        'quiet': True,
        'no_warnings': True,
        'max_filesize': 25 * 1024 * 1024,
        'noplaylist': True,
    }

    audio_file_path = None
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([f"https://www.youtube.com/watch?v={video_id}"])

        downloaded = glob.glob(f"{out_prefix}.*")
        if downloaded:
            audio_file_path = downloaded[0]
        else:
            raise Exception("File audio tidak berhasil diunduh dari YouTube.")

        file_size = os.path.getsize(audio_file_path)
        if file_size > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Ukuran audio melebihi batas 25MB Whisper API.")

        # 3. Call Whisper API
        with open(audio_file_path, "rb") as f:
            audio_bytes = f.read()

        filename = os.path.basename(audio_file_path)
        mime_type = "audio/mp4" if filename.endswith(".m4a") else ("audio/mpeg" if filename.endswith(".mp3") else "application/octet-stream")

        if provider == "openai":
            endpoint = "https://api.openai.com/v1/audio/transcriptions"
            model_name = "whisper-1"
        else:
            endpoint = "https://api.groq.com/openai/v1/audio/transcriptions"
            model_name = "whisper-large-v3-turbo"

        headers = {
            "Authorization": f"Bearer {api_key}"
        }
        files = {
            "file": (filename, audio_bytes, mime_type)
        }
        data = {
            "model": model_name,
            "response_format": "verbose_json"
        }
        if req.language:
            data["language"] = req.language

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(endpoint, headers=headers, files=files, data=data)

        if resp.status_code != 200:
            err_msg = resp.text
            try:
                err_json = resp.json()
                err_msg = err_json.get("error", {}).get("message", resp.text)
            except Exception:
                pass
            raise HTTPException(status_code=resp.status_code, detail=f"Whisper API error: {err_msg}")

        result_json = resp.json()
        segments = result_json.get("segments", [])

        if not segments:
            raw_text = result_json.get("text", "").strip()
            if raw_text:
                transcript_data = [{
                    "start": 0.0,
                    "duration": 5.0,
                    "text": raw_text
                }]
            else:
                transcript_data = []
        else:
            transcript_data = [
                {
                    "start": round(seg.get("start", 0), 2),
                    "duration": round(max(0.5, seg.get("end", 0) - seg.get("start", 0)), 2),
                    "text": seg.get("text", "").strip()
                }
                for seg in segments
                if seg.get("text", "").strip()
            ]

        total_words = sum(len(item["text"].split()) for item in transcript_data)
        total_duration = transcript_data[-1]["start"] + transcript_data[-1]["duration"] if transcript_data else 0

        return {
            "video_id": video_id,
            "title": meta["title"],
            "author": meta["author"],
            "author_url": meta["author_url"],
            "thumbnail_url": meta["thumbnail_url"],
            "selected_language": result_json.get("language", req.language or "id"),
            "language_name": f"Whisper AI ({model_name})",
            "is_generated": True,
            "is_whisper": True,
            "available_languages": [{"code": "whisper", "name": "Whisper AI", "is_generated": True}],
            "transcript": transcript_data,
            "paragraphs": group_into_paragraphs(transcript_data),
            "total_items": len(transcript_data),
            "total_words": total_words,
            "total_duration": round(total_duration, 2),
            "formatted_duration": format_time(total_duration)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal memproses audio dengan Whisper: {str(e)}")
    finally:
        if audio_file_path and os.path.exists(audio_file_path):
            try:
                os.remove(audio_file_path)
            except Exception:
                pass

def heuristic_polish_text(text: str, language: str = "id") -> str:
    if not text:
        return ""
    text = text.strip()
    if not text:
        return ""
    text = text[0].upper() + text[1:]
    
    # Capitalize after sentence enders (. ? !)
    def cap_after_end(match):
        return match.group(1) + " " + match.group(2).upper()
    text = re.sub(r'([.?!])\s+([a-z])', cap_after_end, text)
    
    # Add natural comma before coordinating / subordinating conjunctions
    if language == "id":
        conjunctions = [
            "tetapi", "namun", "melainkan", "sedangkan", "padahal", 
            "karena", "sehingga", "meskipun", "walaupun"
        ]
        for conj in conjunctions:
            pattern = rf'(?<=[a-zA-Z0-9])\s+({conj})\b'
            text = re.sub(pattern, rf', \1', text, flags=re.IGNORECASE)
    else:
        conjunctions = ["however", "although", "whereas", "nevertheless", "furthermore"]
        for conj in conjunctions:
            pattern = rf'(?<=[a-zA-Z0-9])\s+({conj})\b'
            text = re.sub(pattern, rf', \1', text, flags=re.IGNORECASE)
        # Capitalize isolated 'i'
        text = re.sub(r'\b(i)\b', 'I', text)
    
    # Clean accidental repeated commas or spaces before punctuation
    text = re.sub(r',\s*,', ',', text)
    text = re.sub(r'\s+,', ',', text)
    text = re.sub(r'\s+\.', '.', text)

    # Ensure sentence ends with punctuation
    if not re.search(r'[.?!]$', text):
        text += "."
    
    return text

class PolishRequest(BaseModel):
    transcript: List[TranscriptItem]
    title: Optional[str] = "Video"
    language: Optional[str] = "id"
    api_key: Optional[str] = None
    provider: Optional[str] = "gemini"

@app.post("/api/polish")
async def polish_transcript_endpoint(req: PolishRequest):
    if not req.transcript:
        raise HTTPException(status_code=400, detail="Data transkrip tidak boleh kosong.")
    
    raw_dict = [{"start": t.start, "duration": t.duration, "text": t.text} for t in req.transcript]
    base_paragraphs = group_into_paragraphs(raw_dict)
    
    gemini_key = req.api_key if req.provider == "gemini" else os.getenv("GEMINI_API_KEY")
    openai_key = req.api_key if req.provider == "openai" else os.getenv("OPENAI_API_KEY")
    
    lang_str = "Bahasa Indonesia yang baik, rapi, dan mudah dibaca" if req.language == "id" else "proper English"
    input_text = "\n\n".join([f"[{p['formatted_start']}] {p['text']}" for p in base_paragraphs[:35]])
    prompt = (
        f"Anda adalah editor transkrip profesional seperti NoteGPT.\n"
        f"Tugas Anda adalah merapikan transkrip berikut dari video '{req.title}'.\n"
        f"Aturan penting:\n"
        f"1. Tambahkan tanda baca yang tepat (titik, koma, tanda tanya) dan huruf kapital yang benar di awal kalimat dan nama.\n"
        f"2. Gabungkan potongan kalimat menjadi paragraf narasi yang mengalir dan rapi seperti artikel/buku.\n"
        f"3. JANGAN mengubah arti perkataan pembicara dan pertahankan penanda waktu [MM:SS] di setiap awal paragraf.\n"
        f"4. Gunakan {lang_str}.\n\n"
        f"Berikut transkripnya:\n{input_text}"
    )

    # 1. AI Polish with Gemini if key available
    if gemini_key and req.provider == "gemini":
        for model_name in ["gemini-2.0-flash", "gemini-1.5-flash"]:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
                payload = {
                    "contents": [{"parts": [{"text": prompt}]}]
                }
                async with httpx.AsyncClient(timeout=35.0) as client:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        res_text = data["candidates"][0]["content"]["parts"][0]["text"]
                        return {
                            "result": res_text,
                            "paragraphs": base_paragraphs,
                            "provider": f"Gemini AI ({model_name})"
                        }
            except Exception as e:
                print(f"Gemini {model_name} polish error:", e)

    # 2. AI Polish with OpenAI if key available
    if openai_key and req.provider == "openai":
        try:
            url = "https://api.openai.com/v1/chat/completions"
            headers = {"Authorization": f"Bearer {openai_key}"}
            payload = {
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": "You are NoteGPT, a professional transcript editor. Add punctuation (periods, commas, capitalization) and organize into clean, readable paragraphs with timestamps."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.3
            }
            async with httpx.AsyncClient(timeout=35.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    res_text = data["choices"][0]["message"]["content"]
                    return {
                        "result": res_text,
                        "paragraphs": base_paragraphs,
                        "provider": "OpenAI (GPT-4o Mini)"
                    }
        except Exception as e:
            print("OpenAI polish error:", e)

    # 3. Built-in smart formatting engine (Instant & 100% Free)
    polished_paragraphs = []
    out_md = f"### 📖 Transkrip Rapih & Terstruktur: {req.title}\n\n"
    for p in base_paragraphs:
        polished = heuristic_polish_text(p["text"], req.language or "id")
        p_copy = dict(p)
        p_copy["text"] = polished
        polished_paragraphs.append(p_copy)
        out_md += f"**[{p['formatted_start']}]** {polished}\n\n"
        
    return {
        "result": out_md,
        "paragraphs": polished_paragraphs,
        "provider": "Built-in Smart Engine (Free)"
    }

@app.post("/api/summarize")
async def summarize_video(req: SummarizeRequest):
    if not req.transcript:
        raise HTTPException(status_code=400, detail="Data transkrip tidak boleh kosong.")

    # Check for API Key in request or environment
    gemini_key = req.api_key if req.provider == "gemini" else os.getenv("GEMINI_API_KEY")
    openai_key = req.api_key if req.provider == "openai" else os.getenv("OPENAI_API_KEY")

    full_transcript_text = "\n".join([f"[{format_time(t.start)}] {t.text}" for t in req.transcript])
    # Limit transcript size for context window safety (e.g. first ~30,000 characters)
    clipped_transcript = full_transcript_text[:35000]

    # Mode prompt instruction
    lang_name = "Bahasa Indonesia" if req.language == "id" else "English"
    
    prompts = {
        "summary": f"Buatkan Ringkasan Eksekutif yang komprehensif, terstruktur, dan mudah dipahami dari video '{req.title}' dalam {lang_name}. Sertakan gambaran umum, latar belakang, dan kesimpulan utama.",
        "takeaways": f"Buatkan daftar 5 hingga 10 'Key Takeaways' & Action Points terpenting dari video '{req.title}' dalam {lang_name}. Gunakan format bullet point yang tajam dengan timestamp terkait jika relevan.",
        "chapters": f"Bagi video '{req.title}' menjadi bab-bab waktu (Timestamped Chapters) dalam format: - [MM:SS] Judul Bab: Penjelasan singkat 1-2 kalimat. Gunakan {lang_name}.",
        "mindmap": f"Buatkan struktur konsep / Mind Map berbentuk hierarki pohon teks Markdown yang menggambarkan poin-poin utama video '{req.title}' dalam {lang_name}."
    }
    instruction = prompts.get(req.mode, prompts["summary"])

    # 1. Try Gemini if key available
    if gemini_key and req.provider == "gemini":
        for model_name in ["gemini-2.0-flash", "gemini-1.5-flash"]:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
                payload = {
                    "contents": [
                        {
                            "parts": [
                                {
                                    "text": f"Anda adalah asisten AI profesional pembuat catatan & transkrip video seperti NoteGPT.\n\n"
                                            f"Tugas: {instruction}\n\n"
                                            f"Konteks Transkrip Video:\n{clipped_transcript}\n\n"
                                            f"Gunakan format Markdown rapi dan bersahabat."
                                }
                            ]
                        }
                    ]
                }
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        candidates = data.get("candidates", [])
                        if candidates:
                            text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                            return {"result": text, "provider": f"Gemini AI ({model_name})"}
                    else:
                        print(f"Gemini {model_name} Error:", resp.status_code, resp.text)
            except Exception as e:
                print(f"Gemini {model_name} call exception:", e)

    # 2. Try OpenAI if key available
    if openai_key and req.provider == "openai":
        try:
            url = "https://api.openai.com/v1/chat/completions"
            headers = {"Authorization": f"Bearer {openai_key}"}
            payload = {
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": "You are NoteGPT, a helpful AI assistant summarizing YouTube video transcripts."},
                    {"role": "user", "content": f"{instruction}\n\nVideo Transcript:\n{clipped_transcript}"}
                ],
                "temperature": 0.5
            }
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    text = data["choices"][0]["message"]["content"]
                    return {"result": text, "provider": "OpenAI GPT-4o-mini"}
        except Exception as e:
            print("OpenAI call exception:", e)

    # 3. Fallback to Built-in Heuristic Summarizer
    result = generate_heuristic_summary(req.transcript, req.title or "Video", req.mode or "summary", req.language or "id")
    return {"result": result, "provider": "Built-in Smart Engine (Free)"}

@app.post("/api/chat")
async def chat_with_video(req: ChatRequest):
    if not req.question:
        raise HTTPException(status_code=400, detail="Pertanyaan tidak boleh kosong.")

    full_transcript_text = "\n".join([f"[{format_time(t.start)}] {t.text}" for t in req.transcript])
    clipped_transcript = full_transcript_text[:35000]

    gemini_key = req.api_key if req.provider == "gemini" else os.getenv("GEMINI_API_KEY")

    if gemini_key:
        for model_name in ["gemini-2.0-flash", "gemini-1.5-flash"]:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
                payload = {
                    "contents": [
                        {
                            "parts": [
                                {
                                    "text": f"Anda adalah asisten AI yang menjawab pertanyaan pengguna HANYA berdasarkan transkrip video berikut.\n"
                                            f"Video: {req.title}\n\n"
                                            f"Transkrip:\n{clipped_transcript}\n\n"
                                            f"Pertanyaan: {req.question}\n"
                                            f"Jawablah dengan ramah, akurat, dan cantumkan timestamp [MM:SS] jika Anda mengutip bagian tertentu dari video."
                                }
                            ]
                        }
                    ]
                }
                async with httpx.AsyncClient(timeout=25.0) as client:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        text = data["candidates"][0]["content"]["parts"][0]["text"]
                        return {"answer": text, "provider": f"Gemini AI ({model_name})"}
            except Exception as e:
                print(f"Gemini {model_name} chat error:", e)

    # Heuristic match fallback
    q_words = [w.lower() for w in re.findall(r'\w+', req.question) if len(w) > 2]
    matches = []
    for item in req.transcript:
        score = sum(1 for w in q_words if w in item.text.lower())
        if score > 0:
            matches.append((score, item))

    matches.sort(key=lambda x: x[0], reverse=True)
    if matches:
        top_matches = matches[:3]
        ans = f"Berdasarkan transkrip video **{req.title}**, berikut bagian yang paling relevan dengan pertanyaan Anda:\n\n"
        for score, m in top_matches:
            ans += f"- **[{format_time(m.start)}]**: \"{m.text}\"\n"
        ans += "\n> 💡 *Tips: Masukkan Gemini API Key di menu Pengaturan agar AI dapat memberikan jawaban analisis naratif yang lebih mendalam.*"
        return {"answer": ans, "provider": "Keyword Matcher"}
    else:
        return {
            "answer": f"Tidak ditemukan pembahasan spesifik terkait kata kunci tersebut dalam transkrip. Anda dapat memutar video atau menambahkan API Key untuk penalaran tingkat lanjut.",
            "provider": "Keyword Matcher"
        }

# Mount static files
static_dir = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir, exist_ok=True)

app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
async def serve_index():
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return JSONResponse({"message": "Server berjalan. Silakan buka aplikasi pada frontend statis."})

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8088"))
    reload_enabled = os.getenv("UVICORN_RELOAD", "0").lower() in {"1", "true", "yes"}
    print(f"[NoteTube Server] starting on http://{host}:{port} ...")
    uvicorn.run("server:app", host=host, port=port, reload=reload_enabled)

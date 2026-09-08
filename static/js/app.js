/**
 * TranskripAI - Core Application Logic
 * YouTube Transcript Generator & AI Summarizer
 */

// Application State
const state = {
  deferredInstallPrompt: null,
  currentVideoId: null,
  currentData: null,
  player: null,
  playerReady: false,
  trackingInterval: null,
  activeCueIndex: -1,
  activeParagraphIndex: -1,
  activeTab: 'tab-transcript',
  currentSummaryMode: 'summary',
  viewMode: localStorage.getItem('transcript_view_mode') || 'timeline',
  filterNoise: localStorage.getItem('filter_noise') !== 'false',
  polishedData: null,
  isShowingPolished: false,
  pendingWhisperVideoId: null,
  history: [],
  tts: {
    synth: ('speechSynthesis' in window) ? window.speechSynthesis : null,
    utterance: null,
    isPlaying: false,
    isPaused: false,
    speed: 1.0,
    text: ''
  },
  settings: {
    provider: localStorage.getItem('ai_provider') || 'gemini',
    apiKey: localStorage.getItem('ai_api_key') || '',
    language: localStorage.getItem('ai_language') || 'id',
    theme: localStorage.getItem('app_theme') || 'dark'
  }
};

// DOM Elements Cache
const dom = {
  installAppBtn: document.getElementById('btnInstallApp'),
  themeToggle: document.getElementById('btnThemeToggle'),
  settingsBtn: document.getElementById('btnSettings'),
  settingsModal: document.getElementById('settingsModal'),
  closeSettingsBtn: document.getElementById('btnCloseSettings'),
  saveSettingsBtn: document.getElementById('btnSaveSettings'),
  resetSettingsBtn: document.getElementById('btnResetSettings'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  aiProviderSelect: document.getElementById('aiProviderSelect'),
  summaryLangSelect: document.getElementById('summaryLangSelect'),
  toggleKeyVisibility: document.getElementById('btnToggleKeyVisibility'),

  urlForm: document.getElementById('urlForm'),
  youtubeUrl: document.getElementById('youtubeUrl'),
  btnPaste: document.getElementById('btnPaste'),
  btnExtract: document.getElementById('btnExtract'),
  sampleChips: document.querySelectorAll('.sample-chip'),

  loadingState: document.getElementById('loadingState'),
  errorBanner: document.getElementById('errorBanner'),
  errorTitle: document.getElementById('errorTitle'),
  errorMessage: document.getElementById('errorMessage'),
  btnCloseError: document.getElementById('btnCloseError'),
  whisperFallbackCard: document.getElementById('whisperFallbackCard'),
  btnTranscribeWhisper: document.getElementById('btnTranscribeWhisper'),
  workspace: document.getElementById('workspace'),

  videoTitle: document.getElementById('videoTitle'),
  videoAuthor: document.getElementById('videoAuthor'),
  statDuration: document.getElementById('statDuration'),
  statWords: document.getElementById('statWords'),
  statSegments: document.getElementById('statSegments'),
  langSelect: document.getElementById('langSelect'),

  // Dropdowns
  copyDropdown: document.getElementById('btnCopyDropdown').parentElement,
  exportDropdown: document.getElementById('btnExportDropdown').parentElement,
  btnCopyClean: document.getElementById('btnCopyClean'),
  btnCopyParagraphs: document.getElementById('btnCopyParagraphs'),
  btnCopyParagraphsTime: document.getElementById('btnCopyParagraphsTime'),
  btnCopyTimestamps: document.getElementById('btnCopyTimestamps'),
  btnExportPdf: document.getElementById('btnExportPdf'),
  btnDownloadTxt: document.getElementById('btnDownloadTxt'),
  btnDownloadSrt: document.getElementById('btnDownloadSrt'),
  btnDownloadMd: document.getElementById('btnDownloadMd'),
  btnDownloadJson: document.getElementById('btnDownloadJson'),

  // History Navigation & Drawer
  btnHistoryToggle: document.getElementById('btnHistoryToggle'),
  historyCountBadge: document.getElementById('historyCountBadge'),
  historyDrawer: document.getElementById('historyDrawer'),
  historyBackdrop: document.getElementById('historyBackdrop'),
  btnCloseHistory: document.getElementById('btnCloseHistory'),
  drawerHistoryBadge: document.getElementById('drawerHistoryBadge'),
  historySearchInput: document.getElementById('historySearchInput'),
  historyListContainer: document.getElementById('historyListContainer'),
  btnClearHistory: document.getElementById('btnClearHistory'),

  // Tabs & Panes
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabPanes: document.querySelectorAll('.tab-pane'),

  // Transcript Toolbar & Modes
  btnModeTimeline: document.getElementById('btnModeTimeline'),
  btnModeParagraph: document.getElementById('btnModeParagraph'),
  btnPolishAI: document.getElementById('btnPolishAI'),
  cleanNoiseToggle: document.getElementById('cleanNoiseToggle'),
  transcriptSearch: document.getElementById('transcriptSearch'),
  btnClearSearch: document.getElementById('btnClearSearch'),
  autoScrollToggle: document.getElementById('autoScrollToggle'),

  // Polished View & Banner
  polishStatusBanner: document.getElementById('polishStatusBanner'),
  polishProviderName: document.getElementById('polishProviderName'),
  btnToggleOriginal: document.getElementById('btnToggleOriginal'),
  btnCopyPolished: document.getElementById('btnCopyPolished'),
  btnClosePolishBanner: document.getElementById('btnClosePolishBanner'),
  polishLoading: document.getElementById('polishLoading'),

  // Transcript Lists
  transcriptList: document.getElementById('transcriptList'),
  paragraphList: document.getElementById('paragraphList'),

  // AI Summary Pane & TTS
  aiModeBtns: document.querySelectorAll('.ai-mode-btn'),
  btnListenSummary: document.getElementById('btnListenSummary'),
  btnRegenerateSummary: document.getElementById('btnRegenerateSummary'),
  ttsPlayerBar: document.getElementById('ttsPlayerBar'),
  btnTtsPlayPause: document.getElementById('btnTtsPlayPause'),
  btnTtsStop: document.getElementById('btnTtsStop'),
  ttsSpeedSelect: document.getElementById('ttsSpeedSelect'),
  ttsWaveform: document.getElementById('ttsWaveform'),
  ttsStatusText: document.getElementById('ttsStatusText'),
  summaryLoading: document.getElementById('summaryLoading'),
  summaryResult: document.getElementById('summaryResult'),

  // Chapters Pane
  chaptersList: document.getElementById('chaptersList'),
  btnGenerateChapters: document.getElementById('btnGenerateChapters'),

  // Chatbot Pane
  chatMessages: document.getElementById('chatMessages'),
  chatForm: document.getElementById('chatForm'),
  chatInput: document.getElementById('chatInput'),
  quickPromptBtns: document.querySelectorAll('.quick-prompt-btn'),

  toastContainer: document.getElementById('toastContainer')
};

// ==========================================
// Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    if (dom.installAppBtn) dom.installAppBtn.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    state.deferredInstallPrompt = null;
    if (dom.installAppBtn) dom.installAppBtn.hidden = true;
  });

  dom.installAppBtn?.addEventListener('click', async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    dom.installAppBtn.hidden = true;
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/sw.js').catch(() => {});
  }

  initTheme();
  initSettings();
  initHistory();
  initTts();
  initEventListeners();
  initDropdowns();
});

function initTheme() {
  document.documentElement.setAttribute('data-theme', state.settings.theme);
  updateThemeIcon();
}

function updateThemeIcon() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  dom.themeToggle.innerHTML = isDark ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
}

function initSettings() {
  dom.aiProviderSelect.value = state.settings.provider;
  dom.apiKeyInput.value = state.settings.apiKey;
  dom.summaryLangSelect.value = state.settings.language;
  if (dom.cleanNoiseToggle) {
    dom.cleanNoiseToggle.checked = state.filterNoise;
  }
}

// ==========================================
// Event Listeners Setup
// ==========================================
function initEventListeners() {
  // Theme Toggle
  dom.themeToggle.addEventListener('click', () => {
    const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    state.settings.theme = newTheme;
    localStorage.setItem('app_theme', newTheme);
    updateThemeIcon();
  });

  // Settings Modal
  dom.settingsBtn.addEventListener('click', () => dom.settingsModal.classList.remove('hidden'));
  dom.closeSettingsBtn.addEventListener('click', () => dom.settingsModal.classList.add('hidden'));
  dom.settingsModal.querySelector('.modal-backdrop').addEventListener('click', () => dom.settingsModal.classList.add('hidden'));

  dom.toggleKeyVisibility.addEventListener('click', () => {
    const isPass = dom.apiKeyInput.type === 'password';
    dom.apiKeyInput.type = isPass ? 'text' : 'password';
    dom.toggleKeyVisibility.innerHTML = isPass ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
  });

  dom.saveSettingsBtn.addEventListener('click', () => {
    state.settings.provider = dom.aiProviderSelect.value;
    state.settings.apiKey = dom.apiKeyInput.value.trim();
    state.settings.language = dom.summaryLangSelect.value;

    localStorage.setItem('ai_provider', state.settings.provider);
    localStorage.setItem('ai_api_key', state.settings.apiKey);
    localStorage.setItem('ai_language', state.settings.language);

    dom.settingsModal.classList.add('hidden');
    showToast('Pengaturan berhasil disimpan!', 'success');
  });

  dom.resetSettingsBtn.addEventListener('click', () => {
    dom.apiKeyInput.value = '';
    state.settings.apiKey = '';
    localStorage.removeItem('ai_api_key');
    showToast('API Key telah dihapus.', 'info');
  });

  // URL Form & Paste
  dom.btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        dom.youtubeUrl.value = text.trim();
        dom.youtubeUrl.focus();
        showToast('Tautan ditempel dari clipboard!', 'info');
      }
    } catch {
      showToast('Gagal membaca clipboard. Silakan tempel secara manual (Ctrl+V).', 'error');
    }
  });

  dom.urlForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = dom.youtubeUrl.value.trim();
    if (url) fetchTranscript(url);
  });

  // Sample Chips
  dom.sampleChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const url = chip.getAttribute('data-url');
      dom.youtubeUrl.value = url;
      fetchTranscript(url);
    });
  });

  // Error Close
  dom.btnCloseError.addEventListener('click', () => dom.errorBanner.classList.add('hidden'));

  // Language Change
  dom.langSelect.addEventListener('change', () => {
    if (state.currentVideoId) {
      fetchTranscript(state.currentVideoId, dom.langSelect.value);
    }
  });

  // Tab Navigation
  dom.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // Transcript Search
  dom.transcriptSearch.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    dom.btnClearSearch.classList.toggle('hidden', !query);
    filterTranscript(query);
  });

  dom.btnClearSearch.addEventListener('click', () => {
    dom.transcriptSearch.value = '';
    dom.btnClearSearch.classList.add('hidden');
    filterTranscript('');
  });

  // View Mode Switcher (Timeline vs Mode Baca)
  if (dom.btnModeTimeline) {
    dom.btnModeTimeline.addEventListener('click', () => switchViewMode('timeline'));
  }
  if (dom.btnModeParagraph) {
    dom.btnModeParagraph.addEventListener('click', () => switchViewMode('paragraph'));
  }

  // AI Polish Button
  if (dom.btnPolishAI) {
    dom.btnPolishAI.addEventListener('click', polishTranscript);
  }

  // Noise Filter Toggle
  if (dom.cleanNoiseToggle) {
    dom.cleanNoiseToggle.addEventListener('change', () => {
      state.filterNoise = dom.cleanNoiseToggle.checked;
      localStorage.setItem('filter_noise', state.filterNoise);
      refreshTranscriptViews();
      showToast(state.filterNoise ? 'Filter musik/noise diaktifkan' : 'Menampilkan seluruh teks asli', 'info');
    });
  }

  // Polish Status Banner Actions
  if (dom.btnToggleOriginal) {
    dom.btnToggleOriginal.addEventListener('click', toggleOriginalOrPolished);
  }
  if (dom.btnCopyPolished) {
    dom.btnCopyPolished.addEventListener('click', copyPolished);
  }
  if (dom.btnClosePolishBanner) {
    dom.btnClosePolishBanner.addEventListener('click', () => {
      dom.polishStatusBanner.classList.add('hidden');
    });
  }

  // Copy & Export Actions
  if (dom.btnCopyParagraphs) {
    dom.btnCopyParagraphs.addEventListener('click', () => copyParagraphs(false));
  }
  if (dom.btnCopyParagraphsTime) {
    dom.btnCopyParagraphsTime.addEventListener('click', () => copyParagraphs(true));
  }
  dom.btnCopyClean.addEventListener('click', copyCleanTranscript);
  dom.btnCopyTimestamps.addEventListener('click', copyTranscriptWithTimestamps);
  if (dom.btnExportPdf) dom.btnExportPdf.addEventListener('click', exportPdfDocument);
  dom.btnDownloadTxt.addEventListener('click', () => downloadFile('txt'));
  dom.btnDownloadSrt.addEventListener('click', () => downloadFile('srt'));
  dom.btnDownloadMd.addEventListener('click', () => downloadFile('md'));
  dom.btnDownloadJson.addEventListener('click', () => downloadFile('json'));

  // Whisper Fallback Action
  if (dom.btnTranscribeWhisper) {
    dom.btnTranscribeWhisper.addEventListener('click', () => transcribeWithWhisper());
  }

  // AI Summary Modes
  dom.aiModeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      dom.aiModeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentSummaryMode = btn.getAttribute('data-mode');
      generateAISummary();
    });
  });

  dom.btnRegenerateSummary.addEventListener('click', generateAISummary);
  dom.btnGenerateChapters.addEventListener('click', generateChapters);

  // Chat
  dom.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = dom.chatInput.value.trim();
    if (q) handleUserChat(q);
  });

  dom.quickPromptBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-prompt');
      handleUserChat(prompt);
    });
  });
}

function initDropdowns() {
  document.addEventListener('click', (e) => {
    const isCopy = dom.copyDropdown.contains(e.target);
    const isExport = dom.exportDropdown.contains(e.target);

    if (!isCopy) dom.copyDropdown.classList.remove('active');
    if (!isExport) dom.exportDropdown.classList.remove('active');
  });

  document.getElementById('btnCopyDropdown').addEventListener('click', (e) => {
    e.stopPropagation();
    dom.copyDropdown.classList.toggle('active');
    dom.exportDropdown.classList.remove('active');
  });

  document.getElementById('btnExportDropdown').addEventListener('click', (e) => {
    e.stopPropagation();
    dom.exportDropdown.classList.toggle('active');
    dom.copyDropdown.classList.remove('active');
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;
  dom.tabBtns.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });
  dom.tabPanes.forEach(pane => {
    pane.classList.toggle('active', pane.id === tabId);
  });

  // Auto generate summary if entering summary tab for first time
  if (tabId === 'tab-summary' && dom.summaryResult.querySelector('.empty-ai-prompt')) {
    generateAISummary();
  }
}

// ==========================================
// Video ID Extractor Helper
// ==========================================
function extractVideoId(urlOrId) {
  if (!urlOrId) return '';
  urlOrId = urlOrId.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(urlOrId)) return urlOrId;
  const match = urlOrId.match(/(?:v=|\/v\/|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : '';
}

// ==========================================
// API: Fetch Transcript
// ==========================================
async function fetchTranscript(urlOrId, lang = null) {
  dom.loadingState.classList.remove('hidden');
  dom.errorBanner.classList.add('hidden');
  if (dom.whisperFallbackCard) dom.whisperFallbackCard.classList.add('hidden');
  dom.btnExtract.disabled = true;

  try {
    let apiUrl = `/api/transcript?url=${encodeURIComponent(urlOrId)}`;
    if (lang) apiUrl += `&lang=${encodeURIComponent(lang)}`;

    const res = await fetch(apiUrl);
    const data = await res.json();

    if (!res.ok) {
      let detailMsg = 'Terjadi kesalahan saat mengambil transkrip.';
      let canWhisper = false;
      let vidId = null;

      if (data && data.detail) {
        if (typeof data.detail === 'object') {
          detailMsg = data.detail.message || 'Subtitle tidak ditemukan pada video ini.';
          canWhisper = Boolean(data.detail.can_whisper);
          vidId = data.detail.video_id;
        } else {
          detailMsg = String(data.detail);
          if (detailMsg.toLowerCase().includes('subtitle') || detailMsg.toLowerCase().includes('transkrip') || res.status === 404) {
            canWhisper = true;
          }
        }
      }
      const customErr = new Error(detailMsg);
      customErr.canWhisper = canWhisper;
      customErr.videoId = vidId || extractVideoId(urlOrId);
      throw customErr;
    }

    state.currentData = data;
    state.currentVideoId = data.video_id;

    // Render workspace
    renderWorkspace(data);
    dom.workspace.classList.remove('hidden');

    // Smooth scroll to workspace
    dom.workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Transkrip berhasil dimuat!', 'success');

  } catch (err) {
    console.error('Fetch transcript error:', err);
    dom.errorTitle.textContent = 'Gagal Mengambil Transkrip';
    dom.errorMessage.textContent = err.message || 'Subtitle tidak ditemukan pada video ini.';

    const vidId = err.videoId || extractVideoId(urlOrId);
    state.pendingWhisperVideoId = vidId;

    if (dom.whisperFallbackCard) {
      if (err.canWhisper || vidId) {
        dom.whisperFallbackCard.classList.remove('hidden');
      } else {
        dom.whisperFallbackCard.classList.add('hidden');
      }
    }
    dom.errorBanner.classList.remove('hidden');
  } finally {
    dom.loadingState.classList.add('hidden');
    dom.btnExtract.disabled = false;
  }
}

// ==========================================
// API: Transcribe Audio via Whisper AI
// ==========================================
async function transcribeWithWhisper(videoId) {
  const vid = videoId || state.pendingWhisperVideoId || extractVideoId(dom.youtubeUrl.value);
  if (!vid) {
    showToast('Video ID tidak valid atau tidak ditemukan.', 'error');
    return;
  }

  const apiKey = state.settings.apiKey;
  const provider = state.settings.provider; // groq or openai

  if (!apiKey) {
    showToast('Whisper AI memerlukan API Key (Groq Cloud gratis atau OpenAI). Buka menu Pengaturan untuk memasukkan.', 'warning');
    dom.settingsModal.classList.remove('hidden');
    dom.aiProviderSelect.value = 'groq';
    return;
  }

  dom.loadingState.classList.remove('hidden');
  dom.errorBanner.classList.add('hidden');
  dom.btnExtract.disabled = true;

  const loadingTitle = dom.loadingState.querySelector('.loading-title');
  const loadingSub = dom.loadingState.querySelector('.loading-subtitle');
  const origTitle = loadingTitle ? loadingTitle.textContent : '';
  const origSub = loadingSub ? loadingSub.textContent : '';

  if (loadingTitle) loadingTitle.textContent = 'Mengekstrak audio YouTube & menjalankan Whisper AI...';
  if (loadingSub) loadingSub.textContent = 'Mengunduh audio dan mentranskripsi ucapan otomatis menggunakan model Whisper AI.';

  try {
    const res = await fetch('/api/transcribe-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_id: vid,
        api_key: apiKey,
        provider: provider,
        language: state.settings.language || null
      })
    });

    const data = await res.json();
    if (!res.ok) {
      const errMsg = typeof data.detail === 'object' ? data.detail.message : (data.detail || 'Gagal memproses audio dengan Whisper AI');
      throw new Error(errMsg);
    }

    state.currentData = data;
    state.currentVideoId = data.video_id;

    renderWorkspace(data);
    dom.workspace.classList.remove('hidden');
    dom.workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });

    showToast('Transkrip suara berhasil diekstrak via Whisper AI!', 'success');
  } catch (err) {
    console.error('Whisper transcribe error:', err);
    dom.errorTitle.textContent = 'Gagal Whisper AI';
    dom.errorMessage.textContent = err.message || 'Terjadi kesalahan saat memproses audio video.';
    if (dom.whisperFallbackCard) dom.whisperFallbackCard.classList.add('hidden');
    dom.errorBanner.classList.remove('hidden');
  } finally {
    if (loadingTitle) loadingTitle.textContent = origTitle;
    if (loadingSub) loadingSub.textContent = origSub;
    dom.loadingState.classList.add('hidden');
    dom.btnExtract.disabled = false;
  }
}

// ==========================================
// Render Workspace
// ==========================================
function renderWorkspace(data) {
  // Stop any active TTS audio
  stopTts();
  if (dom.ttsPlayerBar) dom.ttsPlayerBar.classList.add('hidden');

  // Save to history automatically
  saveToHistory(data);

  // 1. Meta Info
  dom.videoTitle.textContent = data.title;
  dom.videoAuthor.textContent = data.author;
  dom.statDuration.textContent = data.formatted_duration;
  dom.statWords.textContent = `${data.total_words.toLocaleString()} kata`;
  dom.statSegments.textContent = `${data.total_items} baris`;

  // Update chat title
  const chatNameEl = document.querySelector('.chat-video-name');
  if (chatNameEl) chatNameEl.textContent = data.title;

  // 2. Language Dropdown
  dom.langSelect.innerHTML = '';
  if (data.available_languages && data.available_languages.length > 0) {
    data.available_languages.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.code;
      opt.textContent = `${l.name} (${l.code}) ${l.is_generated ? '• Auto' : '• Manual'}`;
      if (l.code === data.selected_language) opt.selected = true;
      dom.langSelect.appendChild(opt);
    });
  } else {
    const opt = document.createElement('option');
    opt.value = data.selected_language;
    opt.textContent = data.language_name || data.selected_language;
    dom.langSelect.appendChild(opt);
  }

  // 3. Mount YouTube Player
  loadYouTubePlayer(data.video_id);

  // Reset polished data for new video
  state.polishedData = null;
  state.isShowingPolished = false;
  if (dom.polishStatusBanner) dom.polishStatusBanner.classList.add('hidden');

  // 4. Render Transcript (both Timeline & Paragraph Mode)
  renderTranscriptList(data.transcript);
  const initialParagraphs = data.paragraphs || groupIntoParagraphsClient(data.transcript);
  state.currentData.paragraphs = initialParagraphs;
  renderParagraphList(initialParagraphs);

  // Apply saved view mode (timeline or paragraph)
  applyViewMode(state.viewMode);

  // 5. Render Chapters
  generateChapters();

  // Reset summary view
  dom.summaryResult.innerHTML = `
    <div class="empty-ai-prompt">
      <i class="fa-solid fa-brain"></i>
      <p>Klik tombol <strong>Generate</strong> untuk membuat ringkasan komprehensif dari transkrip video ini.</p>
    </div>
  `;
}

// ==========================================
// YouTube Player IFrame Integration
// ==========================================
function loadYouTubePlayer(videoId) {
  if (state.player && typeof state.player.destroy === 'function') {
    try { state.player.destroy(); } catch (e) {}
  }

  clearInterval(state.trackingInterval);
  state.playerReady = false;

  // Wait until YT API is ready if needed
  if (typeof YT === 'undefined' || !YT.Player) {
    window.onYouTubeIframeAPIReady = () => createPlayer(videoId);
  } else {
    createPlayer(videoId);
  }
}

function createPlayer(videoId) {
  state.player = new YT.Player('ytPlayer', {
    videoId: videoId,
    playerVars: {
      autoplay: 0,
      modestbranding: 1,
      rel: 0,
      playsinline: 1
    },
    events: {
      onReady: () => {
        state.playerReady = true;
        startSyncTracker();
      },
      onStateChange: (event) => {
        if (event.data === YT.PlayerState.PLAYING) {
          startSyncTracker();
        } else {
          // keep tracking lightly
        }
      }
    }
  });
}

function seekToSeconds(seconds) {
  if (state.player && typeof state.player.seekTo === 'function') {
    state.player.seekTo(seconds, true);
    state.player.playVideo();
  }
}

// ==========================================
// Noise Cleaner & Paragraph Grouping Helpers
// ==========================================
function cleanNoiseText(text) {
  if (!text) return '';
  let cleaned = text.replace(/\[\s*(?:music|musik|applause|tepuk tangan|tawa|laughter|cheering|sorak|sound effect|audio|suara musik|suara|intro|outro|hening|silence|inaudible|unintelligible|subtitles by|terjemahan oleh)[\s\w.:-]*\]/gi, '');
  cleaned = cleaned.replace(/\[\s*(?:sigh|gasp|noise|cough|batuk|bersin|snort|screaming|shouting)[\s\w]*\]/gi, '');
  cleaned = cleaned.replace(/\(\s*(?:music|musik|applause|laughter|tawa|cheering)[\s\w]*\)/gi, '');
  cleaned = cleaned.replace(/[♪♫♩♬]+/g, '');
  return cleaned.replace(/\s+/g, ' ').trim();
}

function groupIntoParagraphsClient(cues) {
  if (!cues || cues.length === 0) return [];
  const paragraphs = [];
  let currentGroup = [];
  let currentWordCount = 0;
  let pIndex = 0;

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    let cleaned = cleanNoiseText(cue.text);
    if (!cleaned) continue;

    const words = cleaned.split(/\s+/).filter(Boolean);
    currentGroup.push({
      start: cue.start,
      duration: cue.duration,
      text: cleaned
    });
    currentWordCount += words.length;

    let shouldSplit = false;
    if (i < cues.length - 1) {
      const nextCue = cues[i + 1];
      const cueEnd = cue.start + cue.duration;
      const pause = nextCue.start - cueEnd;
      if (pause >= 2.0 && currentWordCount >= 12) shouldSplit = true;
      if (pause >= 1.2 && currentWordCount >= 22) shouldSplit = true;
    }
    if (currentWordCount >= 42) shouldSplit = true;

    if (shouldSplit || i === cues.length - 1) {
      if (currentGroup.length > 0) {
        const pStart = currentGroup[0].start;
        const lastCue = currentGroup[currentGroup.length - 1];
        const pEnd = lastCue.start + lastCue.duration;
        const fullText = currentGroup.map(c => c.text).join(' ');

        paragraphs.push({
          id: `p-${pIndex}`,
          start: pStart,
          end: pEnd,
          formatted_start: formatTime(pStart),
          formatted_end: formatTime(pEnd),
          text: fullText,
          word_count: fullText.split(/\s+/).filter(Boolean).length
        });
        pIndex++;
        currentGroup = [];
        currentWordCount = 0;
      }
    }
  }
  return paragraphs;
}

// ==========================================
// View Mode Switcher (Timeline vs Mode Baca)
// ==========================================
function applyViewMode(mode) {
  state.viewMode = mode;
  localStorage.setItem('transcript_view_mode', mode);

  if (mode === 'paragraph') {
    if (dom.btnModeParagraph) dom.btnModeParagraph.classList.add('active');
    if (dom.btnModeTimeline) dom.btnModeTimeline.classList.remove('active');
    if (dom.transcriptList) dom.transcriptList.classList.add('hidden');
    if (dom.paragraphList) dom.paragraphList.classList.remove('hidden');
  } else {
    if (dom.btnModeTimeline) dom.btnModeTimeline.classList.add('active');
    if (dom.btnModeParagraph) dom.btnModeParagraph.classList.remove('active');
    if (dom.transcriptList) dom.transcriptList.classList.remove('hidden');
    if (dom.paragraphList) dom.paragraphList.classList.add('hidden');
  }
}

function switchViewMode(mode) {
  applyViewMode(mode);
  const query = dom.transcriptSearch.value.trim();
  if (mode === 'paragraph') {
    const pData = (state.isShowingPolished && state.polishedData && state.polishedData.paragraphs)
      ? state.polishedData.paragraphs
      : (state.currentData ? (state.currentData.paragraphs || groupIntoParagraphsClient(state.currentData.transcript)) : []);
    renderParagraphList(pData, query);
  } else {
    if (state.currentData && state.currentData.transcript) {
      renderTranscriptList(state.currentData.transcript, query);
    }
  }
}

function refreshTranscriptViews() {
  if (!state.currentData) return;
  const query = dom.transcriptSearch.value.trim();
  renderTranscriptList(state.currentData.transcript, query);

  const pData = (state.isShowingPolished && state.polishedData && state.polishedData.paragraphs)
    ? state.polishedData.paragraphs
    : (state.currentData.paragraphs || groupIntoParagraphsClient(state.currentData.transcript));
  renderParagraphList(pData, query);
}

// ==========================================
// Highlighting & Auto-scroll Sync
// ==========================================
function startSyncTracker() {
  clearInterval(state.trackingInterval);
  state.trackingInterval = setInterval(() => {
    if (!state.playerReady || !state.player || typeof state.player.getCurrentTime !== 'function') return;

    const currentTime = state.player.getCurrentTime();
    if (!state.currentData) return;

    // 1. Sync Timeline Mode (cues)
    if (state.currentData.transcript && state.viewMode === 'timeline') {
      const items = state.currentData.transcript;
      let foundIndex = -1;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const nextItem = items[i + 1];
        const endTime = nextItem ? nextItem.start : (item.start + item.duration + 1);

        if (currentTime >= item.start && currentTime < endTime) {
          foundIndex = i;
          break;
        }
      }

      if (foundIndex !== -1 && foundIndex !== state.activeCueIndex) {
        state.activeCueIndex = foundIndex;
        highlightActiveCue(foundIndex);
      }
    }

    // 2. Sync Paragraph Mode
    if (state.viewMode === 'paragraph') {
      const paragraphs = (state.isShowingPolished && state.polishedData && state.polishedData.paragraphs)
        ? state.polishedData.paragraphs
        : (state.currentData.paragraphs || []);

      if (paragraphs && paragraphs.length > 0) {
        let foundPIndex = -1;
        for (let i = 0; i < paragraphs.length; i++) {
          const p = paragraphs[i];
          const nextP = paragraphs[i + 1];
          const pEnd = nextP ? nextP.start : (p.end || (p.start + 30));

          if (currentTime >= p.start && currentTime < pEnd) {
            foundPIndex = i;
            break;
          }
        }

        if (foundPIndex !== -1 && foundPIndex !== state.activeParagraphIndex) {
          state.activeParagraphIndex = foundPIndex;
          highlightActiveParagraph(foundPIndex);
        }
      }
    }
  }, 250);
}

function highlightActiveCue(index) {
  const rows = dom.transcriptList.querySelectorAll('.transcript-item');
  rows.forEach(r => r.classList.remove('active'));

  const activeRow = dom.transcriptList.querySelector(`[data-index="${index}"]`);
  if (activeRow) {
    activeRow.classList.add('active');

    if (dom.autoScrollToggle.checked && state.activeTab === 'tab-transcript' && state.viewMode === 'timeline') {
      activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

function highlightActiveParagraph(index) {
  const cards = dom.paragraphList.querySelectorAll('.paragraph-card');
  cards.forEach(c => c.classList.remove('active'));

  const activeCard = dom.paragraphList.querySelector(`[data-p-index="${index}"]`);
  if (activeCard) {
    activeCard.classList.add('active');

    if (dom.autoScrollToggle.checked && state.activeTab === 'tab-transcript' && state.viewMode === 'paragraph') {
      activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

// ==========================================
// Transcript List Rendering (Timeline Mode)
// ==========================================
function renderTranscriptList(items, filterQuery = '') {
  dom.transcriptList.innerHTML = '';
  if (!items || items.length === 0) {
    dom.transcriptList.innerHTML = '<p class="empty-msg">Tidak ada data transkrip yang dapat ditampilkan.</p>';
    return;
  }

  const queryLower = filterQuery.toLowerCase();
  let matchCount = 0;

  items.forEach((item, index) => {
    let rawText = item.text;
    if (state.filterNoise) {
      rawText = cleanNoiseText(rawText);
      if (!rawText) return; // Skip noise-only cues
    }

    if (queryLower && !rawText.toLowerCase().includes(queryLower)) {
      return; // filter out
    }
    matchCount++;

    const row = document.createElement('div');
    row.className = 'transcript-item';
    row.setAttribute('data-index', index);
    row.setAttribute('data-start', item.start);

    // Format text with highlights if query exists
    let displayText = escapeHtml(rawText);
    if (queryLower) {
      const regex = new RegExp(`(${escapeRegExp(filterQuery)})`, 'gi');
      displayText = displayText.replace(regex, '<mark class="highlight">$1</mark>');
    }

    const timeFormatted = formatTime(item.start);

    row.innerHTML = `
      <button type="button" class="cue-time" title="Lompat ke ${timeFormatted}">${timeFormatted}</button>
      <div class="cue-text">${displayText}</div>
      <div class="cue-actions">
        <button type="button" class="btn-cue-copy" title="Salin baris ini"><i class="fa-regular fa-copy"></i></button>
      </div>
    `;

    // Click row or timestamp -> seek video
    row.querySelector('.cue-time').addEventListener('click', (e) => {
      e.stopPropagation();
      seekToSeconds(item.start);
    });

    row.addEventListener('click', () => {
      seekToSeconds(item.start);
    });

    // Copy single line
    row.querySelector('.btn-cue-copy').addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(`[${timeFormatted}] ${rawText}`);
      showToast('Baris transkrip tersalin!', 'info');
    });

    dom.transcriptList.appendChild(row);
  });

  if (matchCount === 0 && queryLower) {
    dom.transcriptList.innerHTML = `
      <div class="empty-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <p>Tidak ditemukan teks yang cocok dengan "<strong>${escapeHtml(filterQuery)}</strong>"</p>
      </div>
    `;
  }
}

// ==========================================
// Paragraph List Rendering (Mode Baca)
// ==========================================
function renderParagraphList(paragraphs, filterQuery = '') {
  dom.paragraphList.innerHTML = '';
  if (!paragraphs || paragraphs.length === 0) {
    dom.paragraphList.innerHTML = '<p class="empty-msg">Tidak ada data paragraf yang dapat ditampilkan.</p>';
    return;
  }

  const queryLower = filterQuery.toLowerCase();
  let matchCount = 0;

  paragraphs.forEach((p, index) => {
    let pText = p.text;
    if (state.filterNoise) {
      pText = cleanNoiseText(pText);
    }
    if (!pText) return;

    if (queryLower && !pText.toLowerCase().includes(queryLower)) {
      return;
    }
    matchCount++;

    const card = document.createElement('div');
    card.className = 'paragraph-card';
    card.setAttribute('data-p-index', index);
    card.setAttribute('data-start', p.start);
    card.setAttribute('data-end', p.end);

    let displayText = escapeHtml(pText);
    if (queryLower) {
      const regex = new RegExp(`(${escapeRegExp(filterQuery)})`, 'gi');
      displayText = displayText.replace(regex, '<mark class="highlight">$1</mark>');
    }

    const wordCount = p.word_count || pText.split(/\s+/).filter(Boolean).length;

    card.innerHTML = `
      <div class="paragraph-card-header">
        <button type="button" class="paragraph-time-badge" title="Lompat ke ${p.formatted_start}">
          <i class="fa-regular fa-clock"></i>
          <span>${p.formatted_start}</span>
        </button>
        <span class="paragraph-word-count">${wordCount} kata</span>
        <div class="paragraph-actions">
          <button type="button" class="btn-p-copy" title="Salin paragraf ini">
            <i class="fa-regular fa-copy"></i>
          </button>
        </div>
      </div>
      <div class="paragraph-card-body">
        <p class="paragraph-text">${displayText}</p>
      </div>
    `;

    // Click time badge or card to seek
    card.querySelector('.paragraph-time-badge').addEventListener('click', (e) => {
      e.stopPropagation();
      seekToSeconds(p.start);
    });

    card.addEventListener('click', () => {
      seekToSeconds(p.start);
    });

    // Copy single paragraph (clean text without timestamp)
    card.querySelector('.btn-p-copy').addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(pText);
      showToast('Paragraf bersih tersalin!', 'info');
    });

    dom.paragraphList.appendChild(card);
  });

  if (matchCount === 0 && queryLower) {
    dom.paragraphList.innerHTML = `
      <div class="empty-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <p>Tidak ditemukan teks paragraf yang cocok dengan "<strong>${escapeHtml(filterQuery)}</strong>"</p>
      </div>
    `;
  }
}

function filterTranscript(query) {
  if (!state.currentData) return;
  if (state.viewMode === 'paragraph') {
    const pData = (state.isShowingPolished && state.polishedData && state.polishedData.paragraphs)
      ? state.polishedData.paragraphs
      : (state.currentData.paragraphs || groupIntoParagraphsClient(state.currentData.transcript));
    renderParagraphList(pData, query);
  } else {
    renderTranscriptList(state.currentData.transcript, query);
  }
}

// ==========================================
// AI Polishing Engine (Punctuation & Grammar)
// ==========================================
async function polishTranscript() {
  if (!state.currentData || !state.currentData.transcript) {
    showToast('Silakan muat video terlebih dahulu.', 'warning');
    return;
  }

  dom.btnPolishAI.disabled = true;
  dom.polishLoading.classList.remove('hidden');

  try {
    const payload = {
      transcript: state.currentData.transcript,
      title: state.currentData.title,
      language: state.settings.language,
      api_key: state.settings.apiKey || null,
      provider: state.settings.provider
    };

    const res = await fetch('/api/polish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Gagal merapikan transkrip');

    state.polishedData = data;
    state.isShowingPolished = true;

    // Show status banner
    dom.polishProviderName.textContent = data.provider || 'Smart Paragraph Engine';
    dom.btnToggleOriginal.textContent = 'Lihat Asli';
    dom.polishStatusBanner.classList.remove('hidden');

    // Switch to paragraph mode automatically for best reading experience
    applyViewMode('paragraph');

    // Render polished paragraphs
    if (data.paragraphs && data.paragraphs.length > 0) {
      renderParagraphList(data.paragraphs);
    } else if (data.result) {
      const parsed = parseMarkdownToParagraphs(data.result);
      state.polishedData.paragraphs = parsed;
      renderParagraphList(parsed);
    }

    showToast(`Transkrip berhasil dirapikan via ${data.provider}!`, 'success');
  } catch (err) {
    console.error('Polish error:', err);
    showToast(`Gagal merapikan: ${err.message}`, 'error');
  } finally {
    dom.polishLoading.classList.add('hidden');
    dom.btnPolishAI.disabled = false;
  }
}

function parseMarkdownToParagraphs(mdText) {
  if (!mdText) return [];
  const lines = mdText.split(/\n\n+/);
  const result = [];
  lines.forEach((line, idx) => {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('---')) return;

    // Extract [MM:SS] if present
    const timeMatch = line.match(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/);
    const startSec = timeMatch ? parseTimeToSeconds(timeMatch[1]) : (idx * 30);
    const formattedStart = timeMatch ? timeMatch[1] : formatTime(startSec);
    const cleanText = line.replace(/\*\*\[.*?\]\*\*/g, '').replace(/\[.*?\]/g, '').trim();

    if (cleanText) {
      result.push({
        id: `p-${idx}`,
        start: startSec,
        end: startSec + 30,
        formatted_start: formattedStart,
        formatted_end: formatTime(startSec + 30),
        text: cleanText,
        word_count: cleanText.split(/\s+/).filter(Boolean).length
      });
    }
  });
  return result;
}

function toggleOriginalOrPolished() {
  if (!state.currentData) return;
  state.isShowingPolished = !state.isShowingPolished;

  const query = dom.transcriptSearch.value.trim();
  if (state.isShowingPolished && state.polishedData) {
    dom.btnToggleOriginal.textContent = 'Lihat Asli';
    renderParagraphList(state.polishedData.paragraphs || parseMarkdownToParagraphs(state.polishedData.result), query);
    showToast('Menampilkan transkrip hasil rapian AI', 'info');
  } else {
    dom.btnToggleOriginal.textContent = 'Lihat Rapih';
    renderParagraphList(state.currentData.paragraphs || groupIntoParagraphsClient(state.currentData.transcript), query);
    showToast('Menampilkan transkrip asli', 'info');
  }
}

function copyPolished() {
  if (!state.polishedData) return;
  if (state.polishedData.result) {
    copyToClipboard(state.polishedData.result);
  } else if (state.polishedData.paragraphs) {
    const text = state.polishedData.paragraphs.map(p => `[${p.formatted_start}] ${p.text}`).join('\n\n');
    copyToClipboard(text);
  }
  showToast('Transkrip rapi disalin ke clipboard!', 'success');
}

function copyParagraphs(includeTimestamps = false) {
  const paragraphs = (state.isShowingPolished && state.polishedData && state.polishedData.paragraphs)
    ? state.polishedData.paragraphs
    : (state.currentData ? (state.currentData.paragraphs || groupIntoParagraphsClient(state.currentData.transcript)) : null);

  if (!paragraphs || paragraphs.length === 0) {
    showToast('Tidak ada data paragraf untuk disalin', 'warning');
    return;
  }

  const text = paragraphs.map(p => {
    let t = p.text;
    if (state.filterNoise) t = cleanNoiseText(t);
    return includeTimestamps ? `[${p.formatted_start}] ${t}` : t;
  }).join('\n\n');

  copyToClipboard(text);
  showToast(
    includeTimestamps
      ? 'Transkrip paragraf (+ timestamp) berhasil disalin!'
      : 'Transkrip paragraf bersih (tanpa timestamp) berhasil disalin!',
    'success'
  );
  dom.copyDropdown.classList.remove('active');
}

// ==========================================
// AI Summarization
// ==========================================
async function generateAISummary() {
  if (!state.currentData || !state.currentData.transcript) return;

  stopTts();
  dom.summaryLoading.classList.remove('hidden');
  dom.summaryResult.innerHTML = '';
  dom.btnRegenerateSummary.disabled = true;

  try {
    const payload = {
      transcript: state.currentData.transcript,
      title: state.currentData.title,
      mode: state.currentSummaryMode,
      language: state.settings.language,
      api_key: state.settings.apiKey || null,
      provider: state.settings.provider
    };

    const res = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Gagal membuat ringkasan AI');

    // Parse Markdown using marked.js
    const renderedHtml = typeof marked !== 'undefined' ? marked.parse(data.result) : `<pre>${escapeHtml(data.result)}</pre>`;
    
    dom.summaryResult.innerHTML = `
      <div class="ai-provider-badge">
        <i class="fa-solid fa-sparkles"></i> Dihasilkan oleh: <strong>${data.provider}</strong>
      </div>
      <div class="summary-content">${renderedHtml}</div>
    `;

    // Add interactive click to timestamp inside summary if any
    setupTimestampLinks(dom.summaryResult);

  } catch (err) {
    console.error('Summary error:', err);
    dom.summaryResult.innerHTML = `
      <div class="error-banner">
        <p>Gagal membuat ringkasan: ${err.message}</p>
      </div>
    `;
  } finally {
    dom.summaryLoading.classList.add('hidden');
    dom.btnRegenerateSummary.disabled = false;
  }
}

// ==========================================
// Chapters Generator
// ==========================================
function generateChapters() {
  if (!state.currentData || !state.currentData.transcript) return;

  const items = state.currentData.transcript;
  dom.chaptersList.innerHTML = '';

  const totalTime = items[items.length - 1].start + items[items.length - 1].duration;
  const numSegments = Math.min(8, Math.max(3, Math.floor(totalTime / 150) || 3));
  const segmentDuration = totalTime / numSegments;

  for (let i = 0; i < numSegments; i++) {
    const segStart = i * segmentDuration;
    const segEnd = (i + 1) * segmentDuration;
    const segItems = items.filter(t => t.start >= segStart && t.start < segEnd);
    if (segItems.length === 0) continue;

    const startSeconds = segItems[0].start;
    const timeFormatted = formatTime(startSeconds);

    // Pick a descriptive sentence
    const segText = segItems.map(t => t.text).join(' ');
    const firstSentence = segText.split(/[.?!]+/)[0] || segItems[0].text;

    const chapterEl = document.createElement('div');
    chapterEl.className = 'chapter-item';
    chapterEl.innerHTML = `
      <div class="chapter-time">${timeFormatted}</div>
      <div class="chapter-info">
        <h4>Bab #${i + 1}</h4>
        <p>${escapeHtml(firstSentence.slice(0, 160))}...</p>
      </div>
    `;

    chapterEl.addEventListener('click', () => {
      seekToSeconds(startSeconds);
      showToast(`Melompat ke bab menit ${timeFormatted}`, 'info');
    });

    dom.chaptersList.appendChild(chapterEl);
  }
}

// ==========================================
// Chatbot Q&A
// ==========================================
async function handleUserChat(question) {
  if (!question.trim()) return;

  // Append user bubble
  appendChatBubble(question, 'user');
  dom.chatInput.value = '';

  // Append bot thinking bubble
  const thinkingId = 'thinking-' + Date.now();
  const thinkingEl = document.createElement('div');
  thinkingEl.className = 'chat-msg bot';
  thinkingEl.id = thinkingId;
  thinkingEl.innerHTML = `
    <div class="chat-avatar"><i class="fa-solid fa-robot"></i></div>
    <div class="chat-bubble"><div class="spinner-sm"></div></div>
  `;
  dom.chatMessages.appendChild(thinkingEl);
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;

  try {
    const payload = {
      transcript: state.currentData.transcript,
      title: state.currentData.title,
      question: question,
      language: state.settings.language,
      api_key: state.settings.apiKey || null,
      provider: state.settings.provider
    };

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Gagal mendapatkan jawaban.');

    thinkingEl.remove();
    appendChatBubble(data.answer, 'bot', data.provider);

  } catch (err) {
    thinkingEl.remove();
    appendChatBubble(`Maaf, terjadi kendala saat menjawab pertanyaan Anda: ${err.message}`, 'bot');
  }
}

function appendChatBubble(text, sender = 'bot', provider = '') {
  const msgEl = document.createElement('div');
  msgEl.className = `chat-msg ${sender}`;

  const rendered = typeof marked !== 'undefined' ? marked.parse(text) : escapeHtml(text);

  msgEl.innerHTML = `
    <div class="chat-avatar"><i class="fa-solid ${sender === 'bot' ? 'fa-robot' : 'fa-user'}"></i></div>
    <div class="chat-bubble">
      ${rendered}
      ${provider ? `<small style="display:block;margin-top:6px;opacity:0.6;font-size:0.75rem;">Via: ${provider}</small>` : ''}
    </div>
  `;

  setupTimestampLinks(msgEl);

  dom.chatMessages.appendChild(msgEl);
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

// Convert [MM:SS] strings into clickable jump buttons
function setupTimestampLinks(container) {
  const pTags = container.querySelectorAll('p, li, div');
  pTags.forEach(el => {
    el.innerHTML = el.innerHTML.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, (match, timeStr) => {
      const seconds = parseTimeToSeconds(timeStr);
      return `<button class="cue-time" onclick="seekToSeconds(${seconds})" style="display:inline-block;padding:1px 6px;margin:0 2px;cursor:pointer;">${timeStr}</button>`;
    });
  });
}

// Make seekToSeconds available in window scope for dynamically generated inline tags
window.seekToSeconds = seekToSeconds;

// ==========================================
// Copy & Export Handlers
// ==========================================
function copyCleanTranscript() {
  if (!state.currentData || !state.currentData.transcript) return;
  const items = state.currentData.transcript;
  const cleanedTexts = items.map(t => state.filterNoise ? cleanNoiseText(t.text) : t.text).filter(Boolean);
  const fullText = cleanedTexts.join(' ');
  copyToClipboard(fullText);
  showToast('Teks transkrip bersih berhasil disalin!', 'success');
  dom.copyDropdown.classList.remove('active');
}

function copyTranscriptWithTimestamps() {
  if (!state.currentData || !state.currentData.transcript) return;
  const items = state.currentData.transcript;
  const formatted = items
    .map(t => {
      const text = state.filterNoise ? cleanNoiseText(t.text) : t.text;
      return text ? `[${formatTime(t.start)}] ${text}` : null;
    })
    .filter(Boolean)
    .join('\n');
  copyToClipboard(formatted);
  showToast('Transkrip dengan timestamp berhasil disalin!', 'success');
  dom.copyDropdown.classList.remove('active');
}

function downloadFile(format) {
  if (!state.currentData || !state.currentData.transcript) return;
  const { title, transcript } = state.currentData;
  const safeFilename = (title || 'transkrip').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);

  let content = '';
  let mimeType = 'text/plain';
  let extension = format;

  if (format === 'txt') {
    if (state.viewMode === 'paragraph') {
      const paragraphs = (state.isShowingPolished && state.polishedData && state.polishedData.paragraphs)
        ? state.polishedData.paragraphs
        : (state.currentData ? (state.currentData.paragraphs || groupIntoParagraphsClient(state.currentData.transcript)) : null);
      if (paragraphs && paragraphs.length > 0) {
        content = `${title}\nURL: https://www.youtube.com/watch?v=${state.currentVideoId}\n\n` +
          paragraphs.map(p => {
            let t = p.text;
            if (state.filterNoise) t = cleanNoiseText(t);
            return t;
          }).join('\n\n');
      } else {
        content = `${title}\nURL: https://www.youtube.com/watch?v=${state.currentVideoId}\n\n` +
          transcript.map(t => `[${formatTime(t.start)}] ${t.text}`).join('\n');
      }
    } else {
      content = `${title}\nURL: https://www.youtube.com/watch?v=${state.currentVideoId}\n\n` +
        transcript.map(t => `[${formatTime(t.start)}] ${t.text}`).join('\n');
    }
  } else if (format === 'srt') {
    content = generateSrt(transcript);
    mimeType = 'application/x-subrip';
  } else if (format === 'md') {
    if (state.viewMode === 'paragraph') {
      const paragraphs = (state.isShowingPolished && state.polishedData && state.polishedData.paragraphs)
        ? state.polishedData.paragraphs
        : (state.currentData ? (state.currentData.paragraphs || groupIntoParagraphsClient(state.currentData.transcript)) : null);
      if (paragraphs && paragraphs.length > 0) {
        content = `# ${title}\n\n> Sumber: https://www.youtube.com/watch?v=${state.currentVideoId}\n\n## Transkrip Paragraf\n\n` +
          paragraphs.map(p => {
            let t = p.text;
            if (state.filterNoise) t = cleanNoiseText(t);
            return t;
          }).join('\n\n');
      } else {
        content = `# ${title}\n\n> Sumber: https://www.youtube.com/watch?v=${state.currentVideoId}\n\n## Transkrip Video\n\n` +
          transcript.map(t => `- **[${formatTime(t.start)}]** ${t.text}`).join('\n');
      }
    } else {
      content = `# ${title}\n\n> Sumber: https://www.youtube.com/watch?v=${state.currentVideoId}\n\n## Transkrip Video\n\n` +
        transcript.map(t => `- **[${formatTime(t.start)}]** ${t.text}`).join('\n');
    }
    mimeType = 'text/markdown';
  } else if (format === 'json') {
    content = JSON.stringify(state.currentData, null, 2);
    mimeType = 'application/json';
  }

  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFilename}.${extension}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  dom.exportDropdown.classList.remove('active');
  showToast(`File .${extension} berhasil diunduh!`, 'success');
}

function generateSrt(items) {
  let srt = '';
  items.forEach((item, index) => {
    const startStr = formatSrtTime(item.start);
    const endStr = formatSrtTime(item.start + item.duration);
    srt += `${index + 1}\n${startStr} --> ${endStr}\n${item.text}\n\n`;
  });
  return srt;
}

function formatSrtTime(seconds) {
  const pad = (n, width = 2) => String(Math.floor(n)).padStart(width, '0');
  const h = pad(seconds / 3600);
  const m = pad((seconds % 3600) / 60);
  const s = pad(seconds % 60);
  const ms = String(Math.round((seconds % 1) * 1000)).padStart(3, '0');
  return `${h}:${m}:${s},${ms}`;
}

// ==========================================
// Utilities
// ==========================================
function formatTime(seconds) {
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseTimeToSeconds(timeStr) {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info');
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
  dom.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==========================================
// Dokumen PDF Cantik (.pdf Export)
// ==========================================
function exportPdfDocument() {
  if (!state.currentData || !state.currentData.transcript) {
    showToast('Silakan muat transkrip terlebih dahulu', 'warning');
    return;
  }

  if (dom.exportDropdown) dom.exportDropdown.classList.remove('active');

  const { title, author, video_id, formatted_duration, total_words, transcript } = state.currentData;
  const isParagraph = state.viewMode === 'paragraph';
  const paragraphs = (state.isShowingPolished && state.polishedData && state.polishedData.paragraphs)
    ? state.polishedData.paragraphs
    : (state.currentData.paragraphs || groupIntoParagraphsClient(transcript));

  // Get AI summary content if generated
  let summaryHtml = '';
  const summaryEl = dom.summaryResult.querySelector('.summary-content');
  if (summaryEl && summaryEl.innerHTML.trim() && !dom.summaryResult.querySelector('.empty-ai-prompt')) {
    summaryHtml = `
      <div class="pdf-summary-section">
        <h2 class="pdf-section-title">&#10024; Ringkasan & Poin Penting AI</h2>
        <div class="pdf-summary-body">
          ${summaryEl.innerHTML}
        </div>
      </div>
    `;
  }

  // Build transcript body
  let transcriptHtml = '';
  if (isParagraph && paragraphs && paragraphs.length > 0) {
    transcriptHtml = `
      <div class="pdf-transcript-section">
        <h2 class="pdf-section-title">&#128221; Transkrip Paragraf</h2>
        ${paragraphs.map(p => {
          let text = p.text;
          if (state.filterNoise) text = cleanNoiseText(text);
          return `
            <div class="pdf-paragraph-item">
              <span class="pdf-time-badge">${p.formatted_start}</span>
              <p class="pdf-p-text">${escapeHtml(text)}</p>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } else {
    transcriptHtml = `
      <div class="pdf-transcript-section">
        <h2 class="pdf-section-title">&#9201; Transkrip Garis Waktu (Timeline)</h2>
        <table class="pdf-table">
          <thead>
            <tr>
              <th style="width: 75px;">Waktu</th>
              <th>Teks Percakapan</th>
            </tr>
          </thead>
          <tbody>
            ${transcript.map(t => {
              let text = t.text;
              if (state.filterNoise) text = cleanNoiseText(text);
              if (!text) return '';
              return `
                <tr>
                  <td class="pdf-table-time">${formatTime(t.start)}</td>
                  <td class="pdf-table-text">${escapeHtml(text)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast('Popup browser diblokir. Izinkan popup untuk mengunduh dokumen PDF.', 'error');
    return;
  }

  const printContent = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)} - Transkrip & Ringkasan Video</title>
  <style>
    @page {
      size: A4;
      margin: 16mm 14mm 16mm 14mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #1e293b;
      line-height: 1.6;
      background: #fff;
      margin: 0;
      padding: 20px;
      font-size: 13px;
    }
    .pdf-header {
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 12px;
      margin-bottom: 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .pdf-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 800;
      font-size: 16px;
      color: #0f172a;
    }
    .pdf-brand-icon {
      background: #ef4444;
      color: white;
      width: 24px;
      height: 24px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }
    .pdf-date {
      font-size: 11px;
      color: #64748b;
    }
    .pdf-title-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px 18px;
      margin-bottom: 20px;
      page-break-inside: avoid;
    }
    .pdf-title-card h1 {
      margin: 0 0 10px 0;
      font-size: 17px;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.35;
    }
    .pdf-meta-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      font-size: 12px;
      color: #475569;
    }
    .pdf-meta-item strong {
      color: #0f172a;
    }
    .pdf-meta-item a {
      color: #3b82f6;
      text-decoration: none;
    }
    .pdf-section-title {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 6px;
      margin: 20px 0 12px 0;
      page-break-after: avoid;
    }
    .pdf-summary-section {
      background: #f1f5f9;
      border-left: 4px solid #6366f1;
      padding: 14px 18px;
      border-radius: 0 8px 8px 0;
      margin-bottom: 20px;
      page-break-inside: avoid;
    }
    .pdf-summary-body {
      font-size: 12.5px;
      line-height: 1.6;
    }
    .pdf-summary-body h3, .pdf-summary-body h4 {
      margin: 10px 0 4px 0;
      font-size: 13px;
    }
    .pdf-summary-body ul, .pdf-summary-body ol {
      margin: 6px 0;
      padding-left: 20px;
    }
    .pdf-summary-body li {
      margin-bottom: 4px;
    }
    .pdf-paragraph-item {
      margin-bottom: 12px;
      page-break-inside: avoid;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .pdf-time-badge {
      background: #e0e7ff;
      color: #4338ca;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 4px;
      white-space: nowrap;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .pdf-p-text {
      margin: 0;
      color: #334155;
      font-size: 12.5px;
      line-height: 1.65;
    }
    .pdf-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
    }
    .pdf-table th {
      background: #f8fafc;
      color: #475569;
      font-weight: 600;
      text-align: left;
      padding: 6px 10px;
      border: 1px solid #e2e8f0;
      font-size: 11px;
      text-transform: uppercase;
    }
    .pdf-table td {
      padding: 6px 10px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }
    .pdf-table-time {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      color: #6366f1;
      font-weight: 700;
      white-space: nowrap;
    }
    .pdf-table-text {
      color: #334155;
      font-size: 12px;
    }
    .pdf-table tr:nth-child(even) td {
      background: #fafafa;
    }
    .pdf-footer {
      margin-top: 28px;
      border-top: 1px solid #e2e8f0;
      padding-top: 10px;
      display: flex;
      justify-content: space-between;
      color: #94a3b8;
      font-size: 10px;
      page-break-inside: avoid;
    }
    @media print {
      body { padding: 0; }
      a { text-decoration: none; color: inherit; }
    }
  </style>
</head>
<body>
  <div class="pdf-header">
    <div class="pdf-brand">
      <span class="pdf-brand-icon">&#9658;</span>
      <span>TranskripAI</span>
    </div>
    <div class="pdf-date">Dicetak pada: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
  </div>

  <div class="pdf-title-card">
    <h1>${escapeHtml(title)}</h1>
    <div class="pdf-meta-grid">
      <div class="pdf-meta-item"><span>Pembuat:</span> <strong>${escapeHtml(author)}</strong></div>
      <div class="pdf-meta-item"><span>Durasi:</span> <strong>${formatted_duration}</strong></div>
      <div class="pdf-meta-item"><span>Jumlah Kata:</span> <strong>${total_words.toLocaleString()} kata</strong></div>
      <div class="pdf-meta-item"><span>YouTube:</span> <a href="https://www.youtube.com/watch?v=${video_id}" target="_blank">https://youtu.be/${video_id}</a></div>
    </div>
  </div>

  ${summaryHtml}
  ${transcriptHtml}

  <div class="pdf-footer">
    <span>Dihasilkan secara otomatis oleh TranskripAI &bull; Catatan Video & AI Summarizer</span>
    <span>Dokumen Transkrip YouTube</span>
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.print();
      }, 350);
    });
  <\/script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(printContent);
  printWindow.document.close();
  showToast('Membuka dialog cetak PDF...', 'info');
}

// ==========================================
// Riwayat Transkrip (History Drawer Panel)
// ==========================================
function initHistory() {
  try {
    const stored = localStorage.getItem('notetube_history');
    state.history = stored ? JSON.parse(stored) : [];
  } catch (e) {
    state.history = [];
  }
  updateHistoryUI();

  if (dom.btnHistoryToggle) {
    dom.btnHistoryToggle.addEventListener('click', openHistoryDrawer);
  }
  if (dom.btnCloseHistory) {
    dom.btnCloseHistory.addEventListener('click', closeHistoryDrawer);
  }
  if (dom.historyBackdrop) {
    dom.historyBackdrop.addEventListener('click', closeHistoryDrawer);
  }
  if (dom.historySearchInput) {
    dom.historySearchInput.addEventListener('input', (e) => {
      renderHistoryList(e.target.value.trim());
    });
  }
  if (dom.btnClearHistory) {
    dom.btnClearHistory.addEventListener('click', () => {
      if (!state.history || state.history.length === 0) return;
      if (confirm('Hapus semua riwayat transkrip yang tersimpan?')) {
        state.history = [];
        localStorage.removeItem('notetube_history');
        updateHistoryUI();
        renderHistoryList();
        showToast('Semua riwayat transkrip telah dihapus.', 'info');
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dom.historyDrawer && !dom.historyDrawer.classList.contains('hidden')) {
      closeHistoryDrawer();
    }
  });
}

function openHistoryDrawer() {
  renderHistoryList();
  if (dom.historyDrawer) dom.historyDrawer.classList.remove('hidden');
  if (dom.historySearchInput) {
    dom.historySearchInput.value = '';
    setTimeout(() => dom.historySearchInput.focus(), 150);
  }
}

function closeHistoryDrawer() {
  if (dom.historyDrawer) dom.historyDrawer.classList.add('hidden');
}

function saveToHistory(data) {
  if (!data || !data.video_id) return;
  const entry = {
    videoId: data.video_id,
    title: data.title || 'Video YouTube',
    author: data.author || 'YouTube Channel',
    thumbnailUrl: data.thumbnail_url || `https://i.ytimg.com/vi/${data.video_id}/hqdefault.jpg`,
    formattedDuration: data.formatted_duration || '00:00',
    totalWords: data.total_words || 0,
    totalItems: data.total_items || 0,
    timestamp: Date.now(),
    isWhisper: Boolean(data.is_whisper),
    cachedData: data
  };

  // Keep latest 30 unique videos
  state.history = [entry, ...state.history.filter(h => h.videoId !== entry.videoId)].slice(0, 30);
  try {
    localStorage.setItem('notetube_history', JSON.stringify(state.history));
  } catch (err) {
    console.warn('LocalStorage limit, optimizing history storage:', err);
    state.history = state.history.map((h, idx) => idx > 5 ? { ...h, cachedData: null } : h);
    try {
      localStorage.setItem('notetube_history', JSON.stringify(state.history));
    } catch (_) {}
  }
  updateHistoryUI();
}

function updateHistoryUI() {
  const count = state.history ? state.history.length : 0;
  if (dom.historyCountBadge) dom.historyCountBadge.textContent = count;
  if (dom.drawerHistoryBadge) dom.drawerHistoryBadge.textContent = count;
}

function renderHistoryList(query = '') {
  if (!dom.historyListContainer) return;
  const container = dom.historyListContainer;
  container.innerHTML = '';

  const q = query.toLowerCase();
  const filtered = (state.history || []).filter(item => {
    if (!q) return true;
    return (item.title && item.title.toLowerCase().includes(q)) ||
           (item.author && item.author.toLowerCase().includes(q));
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="history-empty-state">
        <i class="fa-solid fa-clock-rotate-left"></i>
        <p>${query ? `Tidak ditemukan hasil untuk "<strong>${escapeHtml(query)}</strong>"` : 'Belum ada riwayat transkrip tersimpan.'}</p>
        <small>${query ? 'Coba cari dengan judul atau nama channel lain' : 'Video yang Anda transkrip akan otomatis disimpan di sini.'}</small>
      </div>
    `;
    return;
  }

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'history-card';
    card.setAttribute('data-video-id', item.videoId);

    const relativeTime = formatRelativeTime(item.timestamp);
    const whisperBadge = item.isWhisper ? '<span style="color:var(--primary);font-weight:700;"><i class="fa-solid fa-wand-magic-sparkles"></i> Whisper</span> &bull; ' : '';

    card.innerHTML = `
      <div class="history-thumb-wrap">
        <img src="${item.thumbnailUrl}" alt="Thumbnail" loading="lazy" onerror="this.src='https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg'" />
        <span class="history-duration">${item.formattedDuration}</span>
      </div>
      <div class="history-details">
        <h4 class="history-item-title">${escapeHtml(item.title)}</h4>
        <div class="history-item-meta">
          <span>${escapeHtml(item.author)}</span>
          <span>&bull;</span>
          <span>${whisperBadge}${relativeTime}</span>
        </div>
      </div>
      <button type="button" class="history-btn-del" title="Hapus dari riwayat">
        <i class="fa-regular fa-trash-can"></i>
      </button>
    `;

    // Click card to reload video
    card.addEventListener('click', (e) => {
      if (e.target.closest('.history-btn-del')) return;
      closeHistoryDrawer();

      if (item.cachedData) {
        state.currentData = item.cachedData;
        state.currentVideoId = item.videoId;
        dom.youtubeUrl.value = `https://www.youtube.com/watch?v=${item.videoId}`;
        renderWorkspace(item.cachedData);
        dom.workspace.classList.remove('hidden');
        dom.workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast(`Memuat "${item.title}" dari riwayat!`, 'info');
      } else {
        dom.youtubeUrl.value = `https://www.youtube.com/watch?v=${item.videoId}`;
        fetchTranscript(item.videoId);
      }
    });

    // Delete button
    card.querySelector('.history-btn-del').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteHistoryItem(item.videoId);
    });

    container.appendChild(card);
  });
}

function deleteHistoryItem(videoId) {
  state.history = state.history.filter(h => h.videoId !== videoId);
  try {
    localStorage.setItem('notetube_history', JSON.stringify(state.history));
  } catch (_) {}
  updateHistoryUI();
  renderHistoryList(dom.historySearchInput ? dom.historySearchInput.value.trim() : '');
  showToast('Item riwayat dihapus.', 'info');
}

function formatRelativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Baru saja';
  if (mins < 60) return `${mins} mnt lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

// ==========================================
// Text-to-Speech (TTS) Voice Engine for Summary
// ==========================================
function initTts() {
  if (!('speechSynthesis' in window)) {
    if (dom.btnListenSummary) dom.btnListenSummary.style.display = 'none';
    return;
  }

  // Preload browser voices
  window.speechSynthesis.onvoiceschanged = () => {
    state.tts.voices = window.speechSynthesis.getVoices();
  };

  if (dom.btnListenSummary) {
    dom.btnListenSummary.addEventListener('click', () => {
      if (!state.currentData) {
        showToast('Silakan muat video terlebih dahulu.', 'warning');
        return;
      }
      switchTab('tab-summary');
      if (dom.ttsPlayerBar) dom.ttsPlayerBar.classList.remove('hidden');
      startOrToggleTts();
    });
  }

  if (dom.btnTtsPlayPause) {
    dom.btnTtsPlayPause.addEventListener('click', startOrToggleTts);
  }
  if (dom.btnTtsStop) {
    dom.btnTtsStop.addEventListener('click', stopTts);
  }

  if (dom.ttsSpeedSelect) {
    dom.ttsSpeedSelect.addEventListener('change', () => {
      state.tts.speed = parseFloat(dom.ttsSpeedSelect.value) || 1.0;
      if (state.tts.isPlaying) {
        stopTts();
        startOrToggleTts();
      }
    });
  }
}

function startOrToggleTts() {
  if (!state.tts.synth) {
    showToast('Fitur Text-to-Speech tidak didukung di browser ini.', 'warning');
    return;
  }

  // Resume if paused
  if (state.tts.synth.speaking && state.tts.synth.paused) {
    state.tts.synth.resume();
    state.tts.isPaused = false;
    state.tts.isPlaying = true;
    updateTtsUI(true, 'Memutar Ringkasan AI...');
    return;
  }

  // Pause if currently speaking
  if (state.tts.synth.speaking && !state.tts.synth.paused) {
    state.tts.synth.pause();
    state.tts.isPaused = true;
    state.tts.isPlaying = false;
    updateTtsUI(false, 'Dijeda');
    return;
  }

  // Extract text from summary
  const summaryContentEl = dom.summaryResult ? dom.summaryResult.querySelector('.summary-content') : null;
  if (!summaryContentEl || !summaryContentEl.innerText.trim() || dom.summaryResult.querySelector('.empty-ai-prompt')) {
    showToast('Belum ada ringkasan yang dibuat. Klik tombol Generate terlebih dahulu.', 'info');
    return;
  }

  const rawText = summaryContentEl.innerText;
  const cleanSpeechText = stripMarkdownForSpeech(rawText);

  if (!cleanSpeechText) {
    showToast('Teks ringkasan kosong.', 'warning');
    return;
  }

  // Reset any prior utterance
  state.tts.synth.cancel();

  const utterance = new SpeechSynthesisUtterance(cleanSpeechText);
  state.tts.utterance = utterance;
  utterance.rate = parseFloat(dom.ttsSpeedSelect ? dom.ttsSpeedSelect.value : '1.0') || 1.0;

  // Language & Voice
  const lang = state.settings.language || 'id';
  utterance.lang = lang === 'en' ? 'en-US' : 'id-ID';

  const voices = state.tts.synth.getVoices();
  if (voices && voices.length > 0) {
    const targetCode = lang === 'en' ? 'en' : 'id';
    const found = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(targetCode));
    if (found) utterance.voice = found;
  }

  utterance.onstart = () => {
    state.tts.isPlaying = true;
    state.tts.isPaused = false;
    updateTtsUI(true, 'Memutar Ringkasan AI...');
  };

  utterance.onpause = () => {
    state.tts.isPlaying = false;
    state.tts.isPaused = true;
    updateTtsUI(false, 'Dijeda');
  };

  utterance.onresume = () => {
    state.tts.isPlaying = true;
    state.tts.isPaused = false;
    updateTtsUI(true, 'Memutar Ringkasan AI...');
  };

  utterance.onend = () => {
    state.tts.isPlaying = false;
    state.tts.isPaused = false;
    updateTtsUI(false, 'Selesai didengarkan');
  };

  utterance.onerror = (e) => {
    console.warn('TTS speech error:', e);
    state.tts.isPlaying = false;
    state.tts.isPaused = false;
    updateTtsUI(false, 'Selesai');
  };

  state.tts.synth.speak(utterance);
}

function stopTts() {
  if (state.tts.synth) {
    state.tts.synth.cancel();
  }
  state.tts.isPlaying = false;
  state.tts.isPaused = false;
  updateTtsUI(false, 'Berhenti');
}

function updateTtsUI(isPlaying, statusText = '') {
  if (dom.btnTtsPlayPause) {
    dom.btnTtsPlayPause.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    dom.btnTtsPlayPause.title = isPlaying ? 'Jeda Suara' : 'Putar Ringkasan';
  }
  if (dom.ttsWaveform) {
    dom.ttsWaveform.classList.toggle('active', isPlaying);
  }
  if (dom.ttsStatusText && statusText) {
    dom.ttsStatusText.textContent = statusText;
  }
}

function stripMarkdownForSpeech(md) {
  if (!md) return '';
  return md
    .replace(/```[\s\S]*?```/g, '') // code blocks
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/#{1,6}\s+(.*)/g, '$1. ') // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1') // italics
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/^\s*[-*+]\s+/gm, '') // list items
    .replace(/^\s*\d+\.\s+/gm, '') // numbered lists
    .replace(/>\s*(.*)/g, '$1') // blockquotes
    .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, '') // timestamps
    .replace(/💡|✨|📌|🚀|🎯|🔥|⚡|🤖|•/g, '') // emojis & bullets
    .replace(/\s+/g, ' ')
    .trim();
}


// ===== Dialogue Practice Module =====
const Dialogue = {
    currentSession: null,
    lines: [],
    practiceRole: 'User',
    practiceIndex: 0,
    isPracticing: false,
    recognition: null,
    lastAudioUrl: null,

    init() {
        document.getElementById('back-to-sessions').addEventListener('click', () => {
            this.closeSession();
        });

        // Topic filter
        document.getElementById('dialogue-topic-filter').addEventListener('change', () => {
            this.loadSessions();
        });

        document.getElementById('start-practice').addEventListener('click', () => {
            this.startPractice();
        });

        document.getElementById('mic-btn').addEventListener('click', () => {
            this.toggleRecording();
        });

        document.getElementById('replay-btn').addEventListener('click', () => {
            this.replayCurrentLine();
        });

        document.getElementById('next-line-btn').addEventListener('click', () => {
            this.nextLine();
        });

        // Init speech recognition
        this.initSpeechRecognition();
    },

    async onPageShow() {
        if (!this.currentSession) {
            await this.loadSessions();
        }
    },

    // ===== Session List =====
    async loadSessions() {
        let sessions = await DB.getDialogueSessions();
        const listEl = document.getElementById('session-list');
        const noSessions = document.getElementById('no-sessions');

        // Load topics
        const topics = await DB.getTopics();
        const topicSelect = document.getElementById('dialogue-topic-filter');
        const currentTopic = topicSelect.value;

        // Preserve selection or default to ''
        topicSelect.innerHTML = '<option value="">📌 全部主题</option>';
        topics.forEach(t => {
            const option = document.createElement('option');
            option.value = t;
            option.textContent = t;
            if (t === currentTopic) option.selected = true;
            topicSelect.appendChild(option);
        });

        // Filter by topic
        if (currentTopic) {
            sessions = sessions.filter(s => s.topic === currentTopic);
        }

        if (sessions.length === 0) {
            listEl.innerHTML = '';
            noSessions.classList.remove('hidden');
            return;
        }

        noSessions.classList.add('hidden');
        listEl.innerHTML = sessions.map(s => `
      <div class="session-card" data-id="${s.id}">
        <div class="session-card-info">
          <h4>${this.escapeHtml(s.title)}</h4>
          <p>${s.lineCount} 句对话 · ${new Date(s.createdAt).toLocaleDateString('zh-CN')}</p>
        </div>
        <span class="session-card-arrow">›</span>
      </div>
    `).join('');

        listEl.querySelectorAll('.session-card').forEach(card => {
            card.addEventListener('click', () => {
                this.openSession(parseInt(card.dataset.id));
            });
        });
    },

    // ===== Open Session =====
    async openSession(sessionId) {
        const session = await db.dialogueSessions.get(sessionId);
        if (!session) return;

        this.currentSession = session;
        this.lines = await DB.getDialogueLines(sessionId);

        // Show dialogue view
        document.getElementById('session-list-view').classList.add('hidden');
        document.getElementById('dialogue-view').classList.remove('hidden');
        document.getElementById('session-title').textContent = session.title;

        // Render chat bubbles
        this.renderChat();

        // Reset practice state
        this.isPracticing = false;
        document.getElementById('practice-area').classList.add('hidden');
        document.getElementById('practice-controls').classList.remove('hidden');

        // Enable mic if API key exists
        const hasKey = !!TTS.getApiKey();
        document.getElementById('mic-btn').disabled = !hasKey;
        document.getElementById('mic-status').textContent = hasKey ? '准备就绪' : '请先在设置中配置 API Key';
    },

    closeSession() {
        this.currentSession = null;
        this.lines = [];
        this.isPracticing = false;
        TTS.stop();

        document.getElementById('dialogue-view').classList.add('hidden');
        document.getElementById('session-list-view').classList.remove('hidden');
        document.getElementById('practice-area').classList.add('hidden');

        this.loadSessions();
    },

    // ===== Render Chat =====
    renderChat() {
        const container = document.getElementById('chat-container');
        container.innerHTML = this.lines.map((line, i) => `
      <div class="chat-bubble ${line.speaker.toLowerCase()}" data-index="${i}">
        <div class="chat-speaker">${this.escapeHtml(line.speaker)}</div>
        <div class="chat-english">${this.escapeHtml(line.content)}</div>
        <div class="chat-chinese">${this.escapeHtml(line.chinese)}</div>
      </div>
    `).join('');
    },

    // ===== Practice Mode =====
    async startPractice() {
        this.practiceRole = document.getElementById('role-select').value;
        this.practiceIndex = 0;
        this.isPracticing = true;

        // Switch UI
        document.getElementById('practice-controls').classList.add('hidden');
        document.getElementById('practice-area').classList.remove('hidden');

        // Reset all bubbles
        document.querySelectorAll('.chat-bubble').forEach(b => {
            b.classList.remove('active-line', 'completed-line');
        });

        // Start processing lines
        this.processLine();
    },

    async processLine() {
        if (this.practiceIndex >= this.lines.length) {
            // Practice complete
            App.showToast('🎉 对话练习完成！', 'success');
            this.isPracticing = false;
            document.getElementById('practice-area').classList.add('hidden');
            document.getElementById('practice-controls').classList.remove('hidden');
            return;
        }

        const line = this.lines[this.practiceIndex];
        const bubbles = document.querySelectorAll('.chat-bubble');

        // Highlight current line
        bubbles.forEach((b, i) => {
            b.classList.remove('active-line');
            if (i < this.practiceIndex) b.classList.add('completed-line');
        });
        if (bubbles[this.practiceIndex]) {
            bubbles[this.practiceIndex].classList.add('active-line');
            bubbles[this.practiceIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Reset speech result
        document.getElementById('speech-result').classList.add('hidden');
        document.getElementById('current-line-display').classList.add('hidden');

        if (line.speaker === this.practiceRole) {
            // User's turn - stop any lingering TTS audio first
            TTS.stop();
            document.getElementById('current-line-display').classList.remove('hidden');
            document.getElementById('expected-text').textContent = line.content;
            document.getElementById('chinese-hint').textContent = '💡 ' + line.chinese;
            document.getElementById('mic-status').textContent = '🎙️ 点击麦克风开始录音';
            document.getElementById('mic-btn').disabled = false;
        } else {
            // Other speaker's turn - play TTS
            document.getElementById('mic-status').textContent = '🔊 播放中...';
            document.getElementById('mic-btn').disabled = true;

            try {
                this.lastAudioUrl = await TTS.speak(line.content, line.speaker);
                // Auto advance after TTS finishes
                setTimeout(() => {
                    if (this.isPracticing) {
                        this.practiceIndex++;
                        this.processLine();
                    }
                }, 500);
            } catch (err) {
                console.error('TTS error:', err);
                App.showToast(err.message, 'error');
                document.getElementById('mic-status').textContent = '⚠️ 语音播放失败，点击下一句跳过';
            }
        }
    },

    // ===== Speech Recognition =====
    isRecording: false,
    recognitionTimeout: null,
    gotResult: false,
    _lastInterim: '',
    SpeechRecognitionClass: null,
    _deferredStart: null,

    initSpeechRecognition() {
        this.SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!this.SpeechRecognitionClass) {
            console.warn('[SR] Not supported');
        }
    },

    // Creates a fresh SpeechRecognition instance and starts it
    _createAndStart() {
        // Release any TTS audio session (critical for iOS Safari)
        TTS.stop();

        const recognition = new this.SpeechRecognitionClass();
        recognition.lang = 'en-US';
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.continuous = false;

        recognition.onresult = (event) => {
            for (let i = 0; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    const transcript = event.results[i][0].transcript;
                    console.log('[SR] Final result:', transcript);
                    this.gotResult = true;
                    this.isRecording = false;
                    if (this.recognitionTimeout) {
                        clearTimeout(this.recognitionTimeout);
                        this.recognitionTimeout = null;
                    }
                    document.getElementById('mic-btn').classList.remove('recording');
                    this.handleSpeechResult(transcript);
                    return;
                }
            }
            // Interim result — save it in case stop() won't deliver a final
            const interim = event.results[event.results.length - 1][0].transcript;
            this._lastInterim = interim;
            document.getElementById('mic-status').textContent = '🎙️ ' + interim + '...';
        };

        recognition.onerror = (event) => {
            console.log('[SR] Error:', event.error);
            // no-speech and aborted are handled in onend
            if (event.error === 'no-speech' || event.error === 'aborted') return;
            this.isRecording = false;
            if (this.recognitionTimeout) {
                clearTimeout(this.recognitionTimeout);
                this.recognitionTimeout = null;
            }
            document.getElementById('mic-btn').classList.remove('recording');
            if (event.error === 'not-allowed') {
                document.getElementById('mic-status').textContent = '❌ 请允许麦克风权限';
            } else {
                document.getElementById('mic-status').textContent = '❌ 识别错误: ' + event.error;
            }
        };

        recognition.onend = () => {
            console.log('[SR] onend, gotResult:', this.gotResult, 'isRecording:', this.isRecording);
            this.recognition = null;

            // If a deferred start is waiting, do it now
            if (this._deferredStart) {
                const fn = this._deferredStart;
                this._deferredStart = null;
                fn();
                return;
            }

            // Session ended without a result
            if (this.isRecording && !this.gotResult) {
                this.isRecording = false;
                if (this.recognitionTimeout) {
                    clearTimeout(this.recognitionTimeout);
                    this.recognitionTimeout = null;
                }
                document.getElementById('mic-btn').classList.remove('recording');
                document.getElementById('mic-status').textContent = '❌ 未检测到语音，请再试一次';
            }
        };

        this.recognition = recognition;
        this.gotResult = false;
        recognition.start();
        console.log('[SR] Started new instance');
    },

    toggleRecording() {
        if (!this.SpeechRecognitionClass) {
            const ua = navigator.userAgent;
            const isIOS = /iPhone|iPad|iPod/.test(ua);
            const isHTTPS = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
            if (isIOS && !isHTTPS) {
                document.getElementById('mic-status').textContent = '⚠️ 需要 HTTPS';
            } else if (isIOS) {
                document.getElementById('mic-status').textContent = '⚠️ 请使用 Safari';
            } else {
                document.getElementById('mic-status').textContent = '⚠️ 浏览器不支持语音识别';
            }
            return;
        }

        // Currently recording — user wants to stop
        if (this.isRecording) {
            console.log('[SR] User clicked stop, lastInterim:', this._lastInterim);
            if (this.recognitionTimeout) {
                clearTimeout(this.recognitionTimeout);
                this.recognitionTimeout = null;
            }
            document.getElementById('mic-btn').classList.remove('recording');

            // iOS Safari: stop() won't deliver a final result from interim.
            // Use the last interim result directly if we have one.
            if (this._lastInterim) {
                const transcript = this._lastInterim;
                this._lastInterim = '';
                this.gotResult = true;
                this.isRecording = false;
                console.log('[SR] Using interim as final:', transcript);
                // Stop the recognition session in background
                if (this.recognition) {
                    try { this.recognition.stop(); } catch (e) { }
                }
                this.handleSpeechResult(transcript);
            } else {
                // No interim result — just stop and wait
                document.getElementById('mic-status').textContent = '🔄 处理中...';
                if (this.recognition) {
                    try { this.recognition.stop(); } catch (e) { }
                }
            }
            return;
        }

        // --- Start new recording ---
        this.isRecording = true;
        this.gotResult = false;
        this._lastInterim = '';
        document.getElementById('mic-btn').classList.add('recording');
        document.getElementById('mic-status').textContent = '🎙️ 正在聆听...';
        document.getElementById('speech-result').classList.add('hidden');

        // If an old recognition instance is still alive, stop it and
        // defer our new start to its onend callback
        if (this.recognition) {
            console.log('[SR] Old session alive — deferring start');
            this._deferredStart = () => {
                console.log('[SR] Deferred start executing');
                try {
                    this._createAndStart();
                } catch (e) {
                    console.error('[SR] Deferred start failed:', e);
                    this.isRecording = false;
                    document.getElementById('mic-btn').classList.remove('recording');
                    document.getElementById('mic-status').textContent = '❌ 启动失败，请重试';
                }
            };
            try { this.recognition.stop(); } catch (e) { }
            // Safety: if onend doesn't fire within 2s, force the start
            setTimeout(() => {
                if (this._deferredStart) {
                    console.log('[SR] Forcing deferred start (2s timeout)');
                    const fn = this._deferredStart;
                    this._deferredStart = null;
                    this.recognition = null;
                    fn();
                }
            }, 2000);
            return;
        }

        // No old session — start immediately
        try {
            this._createAndStart();
        } catch (e) {
            console.error('[SR] Start failed:', e);
            this.isRecording = false;
            document.getElementById('mic-btn').classList.remove('recording');
            document.getElementById('mic-status').textContent = '❌ 启动失败，请重试';
            return;
        }

        // Auto-stop after 20 seconds
        this.recognitionTimeout = setTimeout(() => {
            if (this.isRecording && !this.gotResult) {
                console.log('[SR] Timeout');
                document.getElementById('mic-btn').classList.remove('recording');
                document.getElementById('mic-status').textContent = '⏰ 已超时（20秒），请重试';
                if (this.recognition) {
                    try { this.recognition.stop(); } catch (e) { }
                }
                this.isRecording = false;
            }
        }, 20000);
    },

    // ===== Handle Speech Result =====
    handleSpeechResult(spokenText) {
        const line = this.lines[this.practiceIndex];
        if (!line) return;

        const expected = line.content;
        const comparison = this.compareWords(expected, spokenText);

        // Render highlighted words
        const wordsEl = document.getElementById('speech-words');
        wordsEl.innerHTML = comparison.words.map(w =>
            `<span class="${w.matched ? 'word-match' : 'word-mismatch'}">${this.escapeHtml(w.display)}</span>`
        ).join(' ');

        // Calculate and show score
        const score = comparison.matchCount / comparison.totalWords * 100;
        const scoreEl = document.getElementById('speech-score');
        scoreEl.innerHTML = `准确率: <strong>${Math.round(score)}%</strong> (${comparison.matchCount}/${comparison.totalWords} 词)`;

        document.getElementById('speech-result').classList.remove('hidden');
        document.getElementById('mic-status').textContent = score >= 80 ? '✅ 很好！' : '🔄 可以再试一次';
    },

    // ===== Word Comparison =====
    compareWords(expected, spoken) {
        // Normalize: lowercase, remove punctuation except apostrophes
        const normalize = (text) => text.toLowerCase().replace(/[^\w\s']/g, '').split(/\s+/).filter(Boolean);

        const expectedWords = normalize(expected);
        const spokenWords = normalize(spoken);

        // Original words with punctuation for display
        const displayWords = expected.split(/\s+/);

        let matchCount = 0;
        const words = expectedWords.map((word, i) => {
            // Check if the spoken words contain this word (with some tolerance)
            let matched = false;

            // Direct position match
            if (i < spokenWords.length && this.isSimilar(word, spokenWords[i])) {
                matched = true;
            }
            // Search nearby positions
            if (!matched) {
                for (let j = Math.max(0, i - 2); j < Math.min(spokenWords.length, i + 3); j++) {
                    if (this.isSimilar(word, spokenWords[j])) {
                        matched = true;
                        break;
                    }
                }
            }

            if (matched) matchCount++;

            return {
                expected: word,
                display: displayWords[i] || word,
                matched
            };
        });

        return { words, matchCount, totalWords: expectedWords.length };
    },

    // Fuzzy word matching using Levenshtein distance
    isSimilar(a, b) {
        if (a === b) return true;
        if (Math.abs(a.length - b.length) > 2) return false;

        // Simple Levenshtein
        const maxLen = Math.max(a.length, b.length);
        if (maxLen === 0) return true;

        const dist = this.levenshtein(a, b);
        // Allow 1 char error for short words, 2 for longer words
        const threshold = maxLen <= 4 ? 1 : 2;
        return dist <= threshold;
    },

    levenshtein(a, b) {
        const m = a.length, n = b.length;
        const dp = Array.from({ length: m + 1 }, (_, i) => {
            const row = new Array(n + 1);
            row[0] = i;
            return row;
        });
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                dp[i][j] = a[i - 1] === b[j - 1]
                    ? dp[i - 1][j - 1]
                    : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            }
        }
        return dp[m][n];
    },

    // ===== Replay =====
    async replayCurrentLine() {
        const line = this.lines[this.practiceIndex];
        if (!line) return;

        // Determine whose audio to replay
        const speaker = line.speaker === this.practiceRole ? this.practiceRole : line.speaker;
        try {
            await TTS.speak(line.content, speaker);
        } catch (err) {
            App.showToast(err.message, 'error');
        }
    },

    // ===== Next Line =====
    nextLine() {
        if (!this.isPracticing) return;
        this.practiceIndex++;
        this.processLine();
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

// ===== Google Cloud TTS Wrapper =====
const TTS = {
    audioCache: new Map(),
    currentAudio: null,

    getApiKey() {
        return DB.getSettingLocal('apiKey') || '';
    },

    getRate() {
        return parseFloat(DB.getSettingLocal('speechRate') || '1.0');
    },

    getVoice(speaker) {
        if (speaker === 'User') {
            return DB.getSettingLocal('userVoice') || 'en-US-Wavenet-D';
        }
        return DB.getSettingLocal('coachVoice') || 'en-US-Wavenet-F';
    },

    // Synthesize speech using Google Cloud TTS API
    async synthesize(text, speaker = 'User') {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('请先在设置中配置 Google Cloud TTS API Key');
        }

        // Check cache
        const cacheKey = `${text}_${speaker}_${this.getRate()}`;
        if (this.audioCache.has(cacheKey)) {
            return this.audioCache.get(cacheKey);
        }

        const voiceName = this.getVoice(speaker);
        const speakingRate = this.getRate();

        const response = await fetch(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: { text },
                    voice: {
                        languageCode: 'en-US',
                        name: voiceName
                    },
                    audioConfig: {
                        audioEncoding: 'MP3',
                        speakingRate,
                        pitch: 0
                    }
                })
            }
        );

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `TTS API 错误: ${response.status}`);
        }

        const data = await response.json();
        const audioUrl = this.base64ToUrl(data.audioContent, 'audio/mp3');

        // Cache the result
        this.audioCache.set(cacheKey, audioUrl);
        return audioUrl;
    },

    // Play audio from URL
    async play(audioUrl) {
        return new Promise((resolve, reject) => {
            this.stop(); // Stop any current playback

            this.currentAudio = new Audio(audioUrl);
            this.currentAudio.onended = resolve;
            this.currentAudio.onerror = (e) => reject(new Error('音频播放失败'));
            this.currentAudio.play().catch(reject);
        });
    },

    // Synthesize and play in one call
    async speak(text, speaker = 'User') {
        const audioUrl = await this.synthesize(text, speaker);
        await this.play(audioUrl);
        return audioUrl;
    },

    // Stop current playback and fully release audio session
    stop() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.onended = null;
            this.currentAudio.onerror = null;
            this.currentAudio.removeAttribute('src');
            this.currentAudio.load(); // Forces iOS Safari to release audio session
            this.currentAudio = null;
        }
    },

    // Convert base64 to object URL
    base64ToUrl(base64, mimeType) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mimeType });
        return URL.createObjectURL(blob);
    },

    // Clear audio cache
    clearCache() {
        for (const url of this.audioCache.values()) {
            URL.revokeObjectURL(url);
        }
        this.audioCache.clear();
    }
};

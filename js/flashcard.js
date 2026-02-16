// ===== Flashcard Module =====
const Flashcard = {
    currentDeck: 'sentences', // 'sentences', 'natural', or 'vocabulary'
    dueCards: [],
    currentIndex: 0,
    isFlipped: false,
    currentItem: null,

    init() {
        // Deck tab switching
        document.querySelectorAll('.deck-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.deck-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentDeck = tab.dataset.deck;
                this.loadDeck();
            });
        });

        // Rating buttons
        document.querySelectorAll('.rate-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const rating = parseInt(btn.dataset.rating);
                this.rateCard(rating);
            });
        });

        // Re-study button
        document.getElementById('restudy-btn').addEventListener('click', () => {
            this.restudyAll();
        });

        // Audio button on flashcards (event delegation)
        document.getElementById('flashcard').addEventListener('click', (e) => {
            const audioBtn = e.target.closest('.card-audio-btn');
            if (audioBtn) {
                e.stopPropagation();
                const text = audioBtn.dataset.audio;
                if (text) this.playCardAudio(text, audioBtn);
                return;
            }
            this.flipCard();
        });

        // Topic filter
        document.getElementById('flashcard-topic-filter').addEventListener('change', () => {
            this.loadDeck();
        });
    },

    async onPageShow() {
        await this.loadDeck();
    },

    _getProgressType() {
        return this.currentDeck === 'vocabulary' ? 'vocab' : 'sentence';
    },

    // Filter sentence progress cards by sub-type: Format A (has original) vs Format D (no original)
    async _filterSentenceCards(progressCards) {
        const filtered = [];
        for (const p of progressCards) {
            const item = await DB.getSentence(p.itemId);
            if (!item) continue;
            if (this.currentDeck === 'sentences' && item.original) {
                filtered.push(p);
            } else if (this.currentDeck === 'natural' && !item.original) {
                filtered.push(p);
            }
        }
        return filtered;
    },

    async loadDeck() {
        const type = this._getProgressType();
        const allCards = await db.cardProgress.where('type').equals(type).toArray();
        const now = new Date().toISOString();

        let relevantCards = allCards;

        // For sentence-based decks, filter by Format A vs D
        if (type === 'sentence') {
            relevantCards = await this._filterSentenceCards(allCards);
        }

        // Stats from filtered set
        const total = relevantCards.length;
        const due = relevantCards.filter(p => p.nextReview <= now).length;
        const newCards = relevantCards.filter(p => p.repetitions === 0).length;
        const mastered = relevantCards.filter(p => p.repetitions >= 1 && p.interval >= 2).length;

        document.getElementById('stat-due').textContent = due;
        document.getElementById('stat-new').textContent = newCards;
        document.getElementById('stat-mastered').textContent = mastered;

        // Topics
        const topics = await DB.getTopics();
        const topicSelect = document.getElementById('flashcard-topic-filter');
        const currentTopic = topicSelect.value;
        topicSelect.innerHTML = '<option value="">全部主题</option>';
        topics.forEach(t => {
            const option = document.createElement('option');
            option.value = t;
            option.textContent = t;
            if (t === currentTopic) option.selected = true;
            topicSelect.appendChild(option);
        });

        // Due cards from filtered set
        let dueCards = relevantCards.filter(p => p.nextReview <= now);

        // Topic filter
        if (currentTopic) {
            const topicItems = await DB.getItemsByTopic(type === 'sentence' ? 'sentence' : 'vocab', currentTopic);
            const topicItemIds = new Set(topicItems.map(i => i.id));
            dueCards = dueCards.filter(p => topicItemIds.has(p.itemId));
        }

        this.dueCards = dueCards;
        this.currentIndex = 0;
        this.isFlipped = false;

        const cardArea = document.getElementById('card-area');
        const ratingArea = document.getElementById('rating-area');
        const emptyDeck = document.getElementById('empty-deck');
        const noCards = document.getElementById('no-cards');

        ratingArea.classList.add('hidden');

        if (total === 0) {
            cardArea.classList.add('hidden');
            emptyDeck.classList.add('hidden');
            noCards.classList.remove('hidden');
            return;
        }

        noCards.classList.add('hidden');

        if (this.dueCards.length === 0) {
            cardArea.classList.add('hidden');
            emptyDeck.classList.remove('hidden');
            return;
        }

        emptyDeck.classList.add('hidden');
        cardArea.classList.remove('hidden');
        this.showCard();
    },

    async showCard() {
        if (this.currentIndex >= this.dueCards.length) {
            document.getElementById('card-area').classList.add('hidden');
            document.getElementById('rating-area').classList.add('hidden');
            document.getElementById('empty-deck').classList.remove('hidden');
            return;
        }

        const progress = this.dueCards[this.currentIndex];
        const flashcardEl = document.getElementById('flashcard');
        const frontContent = document.getElementById('card-front-content');
        const backContent = document.getElementById('card-back-content');

        // Reset state
        this.isFlipped = false;
        flashcardEl.classList.remove('flipped', 'card-auto-height');
        document.getElementById('rating-area').classList.add('hidden');
        document.getElementById('card-hint').classList.remove('hidden');

        if (progress.type === 'sentence') {
            const item = await DB.getSentence(progress.itemId);
            this.currentItem = item;
            if (!item) { this.currentIndex++; this.showCard(); return; }

            if (!item.original) {
                // Format D: Natural expression — flexible height, no flip
                flashcardEl.classList.add('card-auto-height');
                frontContent.innerHTML = `
                    <div class="english">${this.escapeHtml(item.polished)}</div>
                    <button class="card-audio-btn" data-audio="${this.escapeHtml(item.polished)}">🔊</button>
                    <div class="hint-text">💡 自然表达（无需翻面，点击任意处评分）</div>
                `;
                backContent.innerHTML = '';
                document.getElementById('card-hint').classList.add('hidden');
            } else {
                // Format A: Sentence correction
                frontContent.innerHTML = `
                    <div class="english">${this.escapeHtml(item.polished)}</div>
                    <button class="card-audio-btn" data-audio="${this.escapeHtml(item.polished)}">🔊</button>
                `;
                backContent.innerHTML = `
                    <div class="english" style="opacity:0.7;text-decoration:line-through;">${this.escapeHtml(item.original)}</div>
                    <div class="reason">💡 ${this.escapeHtml(item.reason)}</div>
                `;
            }
        } else {
            const item = await DB.getVocab(progress.itemId);
            this.currentItem = item;
            if (!item) { this.currentIndex++; this.showCard(); return; }

            frontContent.innerHTML = `
                <div class="english">${this.escapeHtml(item.phrase)}</div>
                <div class="pronunciation">${this.escapeHtml(item.pronunciation)}</div>
                <button class="card-audio-btn" data-audio="${this.escapeHtml(item.phrase)}">🔊</button>
            `;
            backContent.innerHTML = `
                <div class="chinese">${this.escapeHtml(item.meaning)}</div>
                <div class="usage">${this.escapeHtml(item.usage)}</div>
            `;
        }
    },

    async flipCard() {
        if (this.dueCards.length === 0) return;
        const flashcardEl = document.getElementById('flashcard');

        // Format D: no flip, just toggle rating
        if (this.currentItem && !this.currentItem.original && this._getProgressType() === 'sentence') {
            if (!this.isFlipped) {
                this.isFlipped = true;
                document.getElementById('rating-area').classList.remove('hidden');
            } else {
                this.isFlipped = false;
                document.getElementById('rating-area').classList.add('hidden');
            }
            return;
        }

        if (!this.isFlipped) {
            flashcardEl.classList.add('flipped');
            this.isFlipped = true;
            document.getElementById('card-hint').classList.add('hidden');
            document.getElementById('rating-area').classList.remove('hidden');
        } else {
            flashcardEl.classList.remove('flipped');
            this.isFlipped = false;
            document.getElementById('rating-area').classList.add('hidden');
            document.getElementById('card-hint').classList.remove('hidden');
        }
    },

    async rateCard(rating) {
        const progress = this.dueCards[this.currentIndex];
        if (!progress) return;
        await DB.updateCardProgress(progress.id, rating);
        this.currentIndex++;
        this.showCard();
    },

    async restudyAll() {
        const type = this._getProgressType();

        if (type === 'sentence') {
            // Only reset cards belonging to current sub-deck
            const allCards = await db.cardProgress.where('type').equals('sentence').toArray();
            const relevantCards = await this._filterSentenceCards(allCards);
            const now = new Date().toISOString();
            await Promise.all(relevantCards.map(c =>
                db.cardProgress.update(c.id, {
                    nextReview: now, interval: 0, repetitions: 0, easeFactor: 2.5
                })
            ));
        } else {
            await DB.resetProgress(type);
        }

        App.showToast('已重置卡片，开始重新学习！');
        await this.loadDeck();
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    async playCardAudio(text, btn) {
        if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
        try {
            await TTS.speak(text, 'User');
        } catch (e) {
            console.error('TTS error:', e);
            App.showToast(e.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🔊'; }
        }
    }
};

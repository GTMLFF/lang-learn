// ===== Flashcard Module =====
const Flashcard = {
    currentDeck: 'sentences', // 'sentences' or 'vocabulary'
    dueCards: [],
    currentIndex: 0,
    isFlipped: false,

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
    },

    async onPageShow() {
        await this.loadDeck();
    },

    async loadDeck() {
        const type = this.currentDeck === 'sentences' ? 'sentence' : 'vocab';

        // Update stats
        const stats = await DB.getCardStats(type);
        document.getElementById('stat-due').textContent = stats.due;
        document.getElementById('stat-new').textContent = stats.new;
        document.getElementById('stat-mastered').textContent = stats.mastered;

        // Load due cards
        this.dueCards = await DB.getDueCards(type);
        this.currentIndex = 0;
        this.isFlipped = false;

        // Show/hide UI elements
        const cardArea = document.getElementById('card-area');
        const ratingArea = document.getElementById('rating-area');
        const emptyDeck = document.getElementById('empty-deck');
        const noCards = document.getElementById('no-cards');

        ratingArea.classList.add('hidden');

        if (stats.total === 0) {
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
            // All cards reviewed
            document.getElementById('card-area').classList.add('hidden');
            document.getElementById('rating-area').classList.add('hidden');
            document.getElementById('empty-deck').classList.remove('hidden');
            // Refresh stats
            const type = this.currentDeck === 'sentences' ? 'sentence' : 'vocab';
            const stats = await DB.getCardStats(type);
            document.getElementById('stat-due').textContent = stats.due;
            document.getElementById('stat-mastered').textContent = stats.mastered;
            return;
        }

        const progress = this.dueCards[this.currentIndex];
        const flashcardEl = document.getElementById('flashcard');
        const frontContent = document.getElementById('card-front-content');
        const backContent = document.getElementById('card-back-content');

        // Reset flip state
        this.isFlipped = false;
        flashcardEl.classList.remove('flipped');
        document.getElementById('rating-area').classList.add('hidden');
        document.getElementById('card-hint').classList.remove('hidden');

        if (progress.type === 'sentence') {
            const item = await DB.getSentence(progress.itemId);
            if (!item) {
                this.currentIndex++;
                this.showCard();
                return;
            }

            // Front: Polished sentence
            frontContent.innerHTML = `
        <div class="english">${this.escapeHtml(item.polished)}</div>
        <button class="card-audio-btn" data-audio="${this.escapeHtml(item.polished)}">🔊</button>
      `;

            // Back: Original sentence + reason
            backContent.innerHTML = `
        <div class="english" style="opacity:0.7;text-decoration:line-through;">${this.escapeHtml(item.original)}</div>
        <div class="reason">💡 ${this.escapeHtml(item.reason)}</div>
      `;
        } else {
            const item = await DB.getVocab(progress.itemId);
            if (!item) {
                this.currentIndex++;
                this.showCard();
                return;
            }

            // Front: phrase + pronunciation + audio
            frontContent.innerHTML = `
        <div class="english">${this.escapeHtml(item.phrase)}</div>
        <div class="pronunciation">${this.escapeHtml(item.pronunciation)}</div>
        <button class="card-audio-btn" data-audio="${this.escapeHtml(item.phrase)}">🔊</button>
      `;

            // Back: meaning + usage
            backContent.innerHTML = `
        <div class="chinese">${this.escapeHtml(item.meaning)}</div>
        <div class="usage">${this.escapeHtml(item.usage)}</div>
      `;
        }
    },

    flipCard() {
        if (this.dueCards.length === 0) return;

        const flashcardEl = document.getElementById('flashcard');

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

        // Update progress in DB
        await DB.updateCardProgress(progress.id, rating);

        // Move to next card
        this.currentIndex++;
        this.showCard();

        // Update ALL stats
        await this.updateAllStats();
    },

    async updateAllStats() {
        const type = this.currentDeck === 'sentences' ? 'sentence' : 'vocab';
        const stats = await DB.getCardStats(type);
        document.getElementById('stat-due').textContent = stats.due;
        document.getElementById('stat-new').textContent = stats.new;
        document.getElementById('stat-mastered').textContent = stats.mastered;
    },

    async restudyAll() {
        const type = this.currentDeck === 'sentences' ? 'sentence' : 'vocab';
        await DB.resetProgress(type);
        App.showToast('已重置所有卡片，开始重新学习！');
        await this.loadDeck();
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    async playCardAudio(text, btn) {
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳';
        }
        try {
            await TTS.speak(text, 'User');
        } catch (e) {
            console.error('TTS error:', e);
            App.showToast(e.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '🔊';
            }
        }
    }
};

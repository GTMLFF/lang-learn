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

        // Topic filter
        document.getElementById('flashcard-topic-filter').addEventListener('change', () => {
            this.loadDeck();
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

        // Load topics
        const topics = await DB.getTopics();
        const topicSelect = document.getElementById('flashcard-topic-filter');
        const currentTopic = topicSelect.value;

        // Preserve selection or default to ''
        topicSelect.innerHTML = '<option value="">全部主题</option>';
        topics.forEach(t => {
            const option = document.createElement('option');
            option.value = t;
            option.textContent = t;
            if (t === currentTopic) option.selected = true;
            topicSelect.appendChild(option);
        });

        // Load due cards
        let dueCards = await DB.getDueCards(type);

        // Filter by topic if selected
        if (currentTopic) {
            const topicItems = await DB.getItemsByTopic(type, currentTopic);
            const topicItemIds = new Set(topicItems.map(i => i.id));
            dueCards = dueCards.filter(p => topicItemIds.has(p.itemId));
        }

        this.dueCards = dueCards;
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
            this.currentItem = item; // Store for flip logic
            if (!item) {
                this.currentIndex++;
                this.showCard();
                return;
            }

            if (!item.original) {
                // Format D: Natural sentence (no flip)
                frontContent.innerHTML = `
            <div class="english large">${this.escapeHtml(item.polished)}</div>
            <button class="card-audio-btn" data-audio="${this.escapeHtml(item.polished)}">🔊</button>
            <div class="hint-text">💡 自然表达（无需翻面）</div>
          `;
                backContent.innerHTML = '';
                // Disable flip for this card type implicitly by hiding rating area until flipped?
                // Actually we should allow "flip" to just hold the rating buttons, 
                // but visually the user sees the same content or just the buttons.
                // Let's keep it simple: front shows content, back is empty but buttons appear when clicked.
                // Or better: Format D cards might just auto-show rating buttons? 
                // The user said "don't flip".
                // I'll make flipCard check if it's Format D and maybe just show rating buttons without rotating?
                // For now, standard flip but back is empty is simplest implementation.
                // Let's disable the "back" content. 
            } else {
                // Format A: Original -> Polished
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
            }
        } else {
            const item = await DB.getVocab(progress.itemId);
            this.currentItem = item;
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

    async flipCard() {
        if (this.dueCards.length === 0) return;

        const flashcardEl = document.getElementById('flashcard');

        // Check for Format D (Natural Sentence) - explicitly no flip
        if (this.currentDeck === 'sentences' && this.currentItem && !this.currentItem.original) {
            // Just show rating buttons for Format D, no flip animation
            if (!this.isFlipped) {
                this.isFlipped = true;
                document.getElementById('card-hint').classList.add('hidden');
                document.getElementById('rating-area').classList.remove('hidden');
            } else {
                this.isFlipped = false;
                document.getElementById('rating-area').classList.add('hidden');
                document.getElementById('card-hint').classList.remove('hidden');
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

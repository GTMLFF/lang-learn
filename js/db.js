// ===== Database Layer (Dexie.js) =====
const db = new Dexie('EnglishLearnDB');

db.version(1).stores({
    sentences: '++id, createdAt',
    dialogueSessions: '++id, createdAt',
    dialogueLines: '++id, sessionId, speaker, order',
    vocabulary: '++id, createdAt',
    cardProgress: '++id, [type+itemId], type, itemId, nextReview'
});

db.version(2).stores({
    sentences: '++id, createdAt, topic',
    dialogueSessions: '++id, createdAt, topic',
    dialogueLines: '++id, sessionId, speaker, order',
    vocabulary: '++id, createdAt, topic',
    cardProgress: '++id, [type+itemId], type, itemId, nextReview'
});

// ===== Helper Functions =====

const DB = {
    // ----- Sentences (Format A) -----
    async addSentences(rows, topic = '') {
        const now = new Date().toISOString();
        const items = rows.map(r => ({
            original: r[0],
            polished: r[1],
            reason: r[2],
            topic,
            createdAt: now
        }));
        const ids = await db.sentences.bulkAdd(items, { allKeys: true });
        // Create card progress entries for new sentences
        const progressItems = ids.map(id => ({
            type: 'sentence',
            itemId: id,
            nextReview: new Date().toISOString(),
            interval: 0,
            repetitions: 0,
            easeFactor: 2.5
        }));
        await db.cardProgress.bulkAdd(progressItems);
        return ids;
    },

    async getSentences() {
        return db.sentences.orderBy('createdAt').reverse().toArray();
    },

    async getSentence(id) {
        return db.sentences.get(id);
    },

    async deleteSentences(ids) {
        await db.sentences.bulkDelete(ids);
        // Also delete associated card progress
        await db.cardProgress
            .where('type').equals('sentence')
            .filter(p => ids.includes(p.itemId))
            .delete();
    },

    // ----- Dialogue Sessions (Format B) -----
    async addDialogueSession(rows, topic = '') {
        const now = new Date().toISOString();
        // Extract a title from the first content line
        const firstContent = rows[0] ? rows[0][1] : 'Untitled';
        const title = firstContent.length > 50 ? firstContent.slice(0, 50) + '...' : firstContent;

        const sessionId = await db.dialogueSessions.add({
            title,
            lineCount: rows.length,
            topic,
            createdAt: now
        });

        const lines = rows.map((r, i) => ({
            sessionId,
            speaker: r[0],
            content: r[1],
            chinese: r[2],
            order: i,
            createdAt: now
        }));

        await db.dialogueLines.bulkAdd(lines);
        return sessionId;
    },

    async getDialogueSessions() {
        return db.dialogueSessions.orderBy('createdAt').reverse().toArray();
    },

    async getDialogueLines(sessionId) {
        return db.dialogueLines
            .where('sessionId').equals(sessionId)
            .sortBy('order');
    },

    async deleteDialogueSession(sessionId) {
        await db.dialogueSessions.delete(sessionId);
        await db.dialogueLines.where('sessionId').equals(sessionId).delete();
    },

    // ----- Vocabulary (Format C) -----
    async addVocabulary(rows, topic = '') {
        const now = new Date().toISOString();
        const items = rows.map(r => ({
            phrase: r[0],
            pronunciation: r[1],
            meaning: r[2],
            usage: r[3],
            topic,
            createdAt: now
        }));
        const ids = await db.vocabulary.bulkAdd(items, { allKeys: true });
        const progressItems = ids.map(id => ({
            type: 'vocab',
            itemId: id,
            nextReview: new Date().toISOString(),
            interval: 0,
            repetitions: 0,
            easeFactor: 2.5
        }));
        await db.cardProgress.bulkAdd(progressItems);
        return ids;
    },

    async getVocabulary() {
        return db.vocabulary.orderBy('createdAt').reverse().toArray();
    },

    async getVocab(id) {
        return db.vocabulary.get(id);
    },

    async deleteVocabulary(ids) {
        await db.vocabulary.bulkDelete(ids);
        await db.cardProgress
            .where('type').equals('vocab')
            .filter(p => ids.includes(p.itemId))
            .delete();
    },

    // ----- Card Progress (SM-2) -----
    async getDueCards(type) {
        const now = new Date().toISOString();
        return db.cardProgress
            .where('type').equals(type)
            .filter(p => p.nextReview <= now)
            .toArray();
    },

    async getCardStats(type) {
        const all = await db.cardProgress.where('type').equals(type).toArray();
        const now = new Date().toISOString();
        const due = all.filter(p => p.nextReview <= now).length;
        const newCards = all.filter(p => p.repetitions === 0).length;
        const mastered = all.filter(p => p.repetitions >= 1 && p.interval >= 2).length;
        return { total: all.length, due, new: newCards, mastered };
    },

    async updateCardProgress(progressId, rating) {
        const progress = await db.cardProgress.get(progressId);
        if (!progress) return;

        let { interval, repetitions, easeFactor } = progress;

        // SM-2 Algorithm
        if (rating === 0) {
            // Again: reset
            repetitions = 0;
            interval = 0;
        } else if (rating === 1) {
            // Hard
            if (repetitions === 0) {
                interval = 1;
            } else {
                interval = Math.ceil(interval * 1.2);
            }
            easeFactor = Math.max(1.3, easeFactor - 0.15);
            repetitions++;
        } else if (rating === 2) {
            // Good
            if (repetitions === 0) {
                interval = 1;
            } else if (repetitions === 1) {
                interval = 3;
            } else {
                interval = Math.ceil(interval * easeFactor);
            }
            repetitions++;
        } else if (rating === 3) {
            // Easy
            if (repetitions === 0) {
                interval = 2;
            } else if (repetitions === 1) {
                interval = 4;
            } else {
                interval = Math.ceil(interval * easeFactor * 1.3);
            }
            easeFactor = Math.min(3.0, easeFactor + 0.15);
            repetitions++;
        }

        // Calculate next review date
        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + interval);

        await db.cardProgress.update(progressId, {
            interval,
            repetitions,
            easeFactor,
            nextReview: nextReview.toISOString()
        });
    },

    async resetProgress(type) {
        const now = new Date().toISOString();
        const cards = await db.cardProgress.where('type').equals(type).toArray();
        const updates = cards.map(c => ({
            key: c.id,
            changes: {
                nextReview: now,
                interval: 0,
                repetitions: 0,
                easeFactor: 2.5
            }
        }));
        await Promise.all(updates.map(u => db.cardProgress.update(u.key, u.changes)));
    },

    // ----- Settings -----
    async getSetting(key) {
        const item = await db.table('settings').get(key).catch(() => null);
        return item ? item.value : null;
    },

    async setSetting(key, value) {
        try {
            await db.table('settings').put({ key, value });
        } catch (e) {
            // settings table may not exist on first run; use localStorage fallback
            localStorage.setItem('el_' + key, JSON.stringify(value));
        }
    },

    // ----- Export / Import -----
    async exportAll() {
        const sentences = await db.sentences.toArray();
        const dialogueSessions = await db.dialogueSessions.toArray();
        const dialogueLines = await db.dialogueLines.toArray();
        const vocabulary = await db.vocabulary.toArray();
        const cardProgress = await db.cardProgress.toArray();
        return { sentences, dialogueSessions, dialogueLines, vocabulary, cardProgress };
    },

    async importAll(data) {
        await db.transaction('rw',
            db.sentences, db.dialogueSessions, db.dialogueLines, db.vocabulary, db.cardProgress,
            async () => {
                if (data.sentences) await db.sentences.bulkPut(data.sentences);
                if (data.dialogueSessions) await db.dialogueSessions.bulkPut(data.dialogueSessions);
                if (data.dialogueLines) await db.dialogueLines.bulkPut(data.dialogueLines);
                if (data.vocabulary) await db.vocabulary.bulkPut(data.vocabulary);
                if (data.cardProgress) await db.cardProgress.bulkPut(data.cardProgress);
            }
        );
    },

    async clearAll() {
        await Promise.all([
            db.sentences.clear(),
            db.dialogueSessions.clear(),
            db.dialogueLines.clear(),
            db.vocabulary.clear(),
            db.cardProgress.clear()
        ]);
    },

    async getItemsByTopic(type, topic) {
        if (type === 'sentence') {
            return db.sentences.where('topic').equals(topic).toArray();
        } else if (type === 'vocab') {
            return db.vocabulary.where('topic').equals(topic).toArray();
        } else if (type === 'dialogue') {
            return db.dialogueSessions.where('topic').equals(topic).toArray();
        }
        return [];
    },

    async getTopics() {
        const sTopics = await db.sentences.orderBy('topic').uniqueKeys();
        const vTopics = await db.vocabulary.orderBy('topic').uniqueKeys();
        const dTopics = await db.dialogueSessions.orderBy('topic').uniqueKeys();
        const all = new Set([...sTopics, ...vTopics, ...dTopics]);
        return Array.from(all).filter(t => t);
    }
};

// Settings fallback using localStorage
DB.getSettingLocal = (key) => {
    try {
        const v = localStorage.getItem('el_' + key);
        return v ? JSON.parse(v) : null;
    } catch { return null; }
};

DB.setSettingLocal = (key, value) => {
    localStorage.setItem('el_' + key, JSON.stringify(value));
};

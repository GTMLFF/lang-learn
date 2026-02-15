// ===== Data Import Module =====
const Import = {
    currentFormat: null,
    parsedData: null,

    init() {
        const csvInput = document.getElementById('csv-input');
        const parseBtn = document.getElementById('parse-btn');
        const saveBtn = document.getElementById('save-btn');

        // Auto-detect format on input
        csvInput.addEventListener('input', () => {
            this.detectFormat(csvInput.value);
        });

        parseBtn.addEventListener('click', () => this.parseAndPreview());
        saveBtn.addEventListener('click', () => this.saveData());

        // Load import history
        this.loadHistory();
    },

    // ===== CSV Parser =====
    parseCSV(text) {
        const lines = text.trim().split('\n');
        const result = [];

        for (const line of lines) {
            if (!line.trim()) continue;
            const row = [];
            let current = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    row.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            row.push(current.trim());
            result.push(row);
        }

        return result;
    },

    // ===== Format Detection =====
    detectFormat(text) {
        const badge = document.getElementById('format-badge');
        if (!text.trim()) {
            badge.classList.add('hidden');
            this.currentFormat = null;
            return;
        }

        const firstLine = text.trim().split('\n')[0].toLowerCase();

        if (firstLine.includes('original sentence') || firstLine.includes('polished version')) {
            this.currentFormat = 'A';
            badge.className = 'format-badge format-a';
            badge.querySelector('.badge-text').textContent = '格式 A · 句子纠错';
            badge.querySelector('.badge-icon').textContent = '📝';
        } else if (firstLine.includes('speaker') && firstLine.includes('content')) {
            this.currentFormat = 'B';
            badge.className = 'format-badge format-b';
            badge.querySelector('.badge-text').textContent = '格式 B · 对话';
            badge.querySelector('.badge-icon').textContent = '💬';
        } else if (firstLine.includes('english phrase') || firstLine.includes('pronunciation')) {
            this.currentFormat = 'C';
            badge.className = 'format-badge format-c';
            badge.querySelector('.badge-text').textContent = '格式 C · 词汇';
            badge.querySelector('.badge-icon').textContent = '📖';
        } else {
            this.currentFormat = null;
            badge.classList.add('hidden');
            return;
        }

        badge.classList.remove('hidden');
    },

    // ===== Parse and Preview =====
    parseAndPreview() {
        const text = document.getElementById('csv-input').value.trim();
        if (!text) {
            App.showToast('请先粘贴数据', 'error');
            return;
        }

        if (!this.currentFormat) {
            App.showToast('无法识别数据格式，请检查表头', 'error');
            return;
        }

        const rows = this.parseCSV(text);
        if (rows.length < 2) {
            App.showToast('数据至少需要两行（表头 + 数据）', 'error');
            return;
        }

        // Remove header row, store data rows
        const headers = rows[0];
        this.parsedData = rows.slice(1).filter(r => r.length >= headers.length && r.some(cell => cell));

        if (this.parsedData.length === 0) {
            App.showToast('未找到有效数据行', 'error');
            return;
        }

        // Render preview
        this.renderPreview(headers, this.parsedData);

        // Show preview area
        document.getElementById('preview-area').classList.remove('hidden');
        document.getElementById('preview-count').textContent = `${this.parsedData.length} 条`;

        App.showToast(`已解析 ${this.parsedData.length} 条数据`, 'success');
    },

    // ===== Render Preview Table =====
    renderPreview(headers, data) {
        const container = document.getElementById('preview-table-container');

        let headerLabels;
        if (this.currentFormat === 'A') {
            headerLabels = ['原始句子', '润色版本', '纠正原因'];
        } else if (this.currentFormat === 'B') {
            headerLabels = ['说话人', '英文内容', '中文翻译'];
        } else {
            headerLabels = ['英文短语', '发音', '含义', '用法'];
        }

        const table = document.createElement('table');
        table.className = 'preview-table';

        // Header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerLabels.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body (show max 20 rows in preview)
        const tbody = document.createElement('tbody');
        const previewRows = data.slice(0, 20);
        previewRows.forEach(row => {
            const tr = document.createElement('tr');
            headerLabels.forEach((_, i) => {
                const td = document.createElement('td');
                td.textContent = row[i] || '';
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);

        container.innerHTML = '';
        container.appendChild(table);

        if (data.length > 20) {
            const more = document.createElement('p');
            more.style.cssText = 'text-align:center;padding:12px;color:var(--text-muted);font-size:13px;';
            more.textContent = `... 还有 ${data.length - 20} 条数据`;
            container.appendChild(more);
        }
    },

    // ===== Save Data =====
    async saveData() {
        if (!this.parsedData || this.parsedData.length === 0) {
            App.showToast('没有数据可保存', 'error');
            return;
        }

        const saveBtn = document.getElementById('save-btn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span>⏳</span> 保存中...';

        try {
            let savedCount = 0;
            let skippedCount = 0;

            if (this.currentFormat === 'A') {
                // Dedup: check by polished sentence
                const existing = await DB.getSentences();
                const existingSet = new Set(existing.map(s => s.polished));
                const newRows = this.parsedData.filter(r => !existingSet.has(r[1]));
                skippedCount = this.parsedData.length - newRows.length;
                if (newRows.length > 0) await DB.addSentences(newRows);
                savedCount = newRows.length;
            } else if (this.currentFormat === 'B') {
                // Dedup: check by first line content
                const sessions = await DB.getDialogueSessions();
                const firstContent = this.parsedData[0] ? this.parsedData[0][1] : '';
                const isDuplicate = sessions.some(s => {
                    const title = firstContent.length > 50 ? firstContent.slice(0, 50) + '...' : firstContent;
                    return s.title === title && s.lineCount === this.parsedData.length;
                });
                if (isDuplicate) {
                    skippedCount = this.parsedData.length;
                } else {
                    await DB.addDialogueSession(this.parsedData);
                    savedCount = this.parsedData.length;
                }
            } else if (this.currentFormat === 'C') {
                // Dedup: check by phrase
                const existing = await DB.getVocabulary();
                const existingSet = new Set(existing.map(v => v.phrase));
                const newRows = this.parsedData.filter(r => !existingSet.has(r[0]));
                skippedCount = this.parsedData.length - newRows.length;
                if (newRows.length > 0) await DB.addVocabulary(newRows);
                savedCount = newRows.length;
            }

            if (skippedCount > 0 && savedCount === 0) {
                App.showToast(`所有 ${skippedCount} 条数据已存在，无需重复保存`, 'error');
            } else if (skippedCount > 0) {
                App.showToast(`✅ 保存 ${savedCount} 条，跳过 ${skippedCount} 条重复`, 'success');
            } else {
                App.showToast(`✅ 成功保存 ${savedCount} 条数据`, 'success');
            }

            // Reset
            document.getElementById('csv-input').value = '';
            document.getElementById('format-badge').classList.add('hidden');
            document.getElementById('preview-area').classList.add('hidden');
            this.parsedData = null;
            this.currentFormat = null;

            // Refresh history
            this.loadHistory();
        } catch (err) {
            console.error('Save error:', err);
            App.showToast('保存失败: ' + err.message, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<span>💾</span> 保存到数据库';
        }
    },

    // ===== Import History =====
    async loadHistory() {
        const list = document.getElementById('history-list');

        const [sentences, sessions, vocab] = await Promise.all([
            DB.getSentences(),
            DB.getDialogueSessions(),
            DB.getVocabulary()
        ]);

        const items = [];

        if (sentences.length > 0) {
            items.push({
                type: '📝 句子纠错',
                count: sentences.length,
                format: 'A',
                data: sentences
            });
        }

        if (sessions.length > 0) {
            for (const s of sessions) {
                items.push({
                    type: '💬 对话',
                    count: s.lineCount,
                    format: 'B',
                    id: s.id,
                    title: s.title,
                    date: new Date(s.createdAt).toLocaleDateString('zh-CN')
                });
            }
        }

        if (vocab.length > 0) {
            items.push({
                type: '📖 词汇短语',
                count: vocab.length,
                format: 'C',
                data: vocab
            });
        }

        if (items.length === 0) {
            list.innerHTML = '<div class="empty-state" style="padding:24px"><div class="empty-icon">📭</div><p style="color:var(--text-muted)">暂无导入数据</p></div>';
            return;
        }

        list.innerHTML = items.map(item => `
      <div class="history-item" data-format="${item.format}" data-id="${item.id || ''}">
        <div class="history-item-info">
          <div class="history-item-type">${item.type}${item.title ? ' · ' + item.title : ''}</div>
          <div class="history-item-meta">${item.count} 条 ${item.date ? '· ' + item.date : ''}</div>
        </div>
        <button class="history-item-delete" title="删除">🗑️</button>
      </div>
    `).join('');

        // Delete handlers
        list.querySelectorAll('.history-item-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const item = btn.closest('.history-item');
                const format = item.dataset.format;
                const id = item.dataset.id;

                App.showConfirm('确认删除', '确定要删除这些数据吗？此操作不可撤销。', async () => {
                    if (format === 'A') {
                        const all = await DB.getSentences();
                        await DB.deleteSentences(all.map(s => s.id));
                    } else if (format === 'B') {
                        await DB.deleteDialogueSession(parseInt(id));
                    } else if (format === 'C') {
                        const all = await DB.getVocabulary();
                        await DB.deleteVocabulary(all.map(v => v.id));
                    }
                    App.showToast('已删除', 'success');
                    this.loadHistory();
                });
            });
        });
    }
};

// ===== Settings Module =====
const Settings = {
    init() {
        // API Key
        document.getElementById('save-api-key').addEventListener('click', () => {
            this.saveApiKey();
        });

        document.getElementById('toggle-key-visibility').addEventListener('click', () => {
            const input = document.getElementById('api-key-input');
            input.type = input.type === 'password' ? 'text' : 'password';
        });

        // Speech rate
        const rateSlider = document.getElementById('speech-rate');
        const rateValue = document.getElementById('rate-value');
        rateSlider.addEventListener('input', () => {
            rateValue.textContent = parseFloat(rateSlider.value).toFixed(1) + 'x';
            DB.setSettingLocal('speechRate', rateSlider.value);
        });

        // Voice selections
        document.getElementById('user-voice').addEventListener('change', (e) => {
            DB.setSettingLocal('userVoice', e.target.value);
        });

        document.getElementById('coach-voice').addEventListener('change', (e) => {
            DB.setSettingLocal('coachVoice', e.target.value);
        });

        // Data management
        document.getElementById('export-data').addEventListener('click', () => this.exportData());
        document.getElementById('import-backup').addEventListener('click', () => {
            document.getElementById('import-file').click();
        });
        document.getElementById('import-file').addEventListener('change', (e) => this.importData(e));
        document.getElementById('clear-data').addEventListener('click', () => this.clearData());

        // Load saved settings
        this.loadSettings();
    },

    loadSettings() {
        // API Key
        const apiKey = DB.getSettingLocal('apiKey');
        if (apiKey) {
            document.getElementById('api-key-input').value = apiKey;
        }

        // Speech rate
        const rate = DB.getSettingLocal('speechRate') || '1.0';
        document.getElementById('speech-rate').value = rate;
        document.getElementById('rate-value').textContent = parseFloat(rate).toFixed(1) + 'x';

        // Voices
        const userVoice = DB.getSettingLocal('userVoice') || 'en-US-Wavenet-D';
        const coachVoice = DB.getSettingLocal('coachVoice') || 'en-US-Wavenet-F';
        document.getElementById('user-voice').value = userVoice;
        document.getElementById('coach-voice').value = coachVoice;
    },

    saveApiKey() {
        const key = document.getElementById('api-key-input').value.trim();
        if (!key) {
            App.showToast('请输入 API Key', 'error');
            return;
        }
        DB.setSettingLocal('apiKey', key);
        TTS.clearCache(); // Clear cache when key changes
        App.showToast('✅ API Key 已保存', 'success');
    },

    async exportData() {
        try {
            const data = await DB.exportAll();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `englishlearn-backup-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            App.showToast('✅ 数据已导出', 'success');
        } catch (err) {
            App.showToast('导出失败: ' + err.message, 'error');
        }
    },

    async importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);
            await DB.importAll(data);
            App.showToast('✅ 数据已导入', 'success');
            // Reset file input
            event.target.value = '';
        } catch (err) {
            App.showToast('导入失败: ' + err.message, 'error');
        }
    },

    clearData() {
        App.showConfirm(
            '⚠️ 清空所有数据',
            '此操作将删除所有导入的数据、学习进度，且不可撤销。确定继续吗？',
            async () => {
                await DB.clearAll();
                App.showToast('✅ 所有数据已清空', 'success');
            }
        );
    }
};

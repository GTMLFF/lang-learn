// ===== App Entry Point =====
const App = {
    currentPage: 'import',

    init() {
        // Initialize all modules
        Import.init();
        Flashcard.init();
        Dialogue.init();
        Settings.init();

        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                this.navigateTo(item.dataset.page);
            });
        });

        // Register service worker
        this.registerSW();

        console.log('✅ EnglishLearn initialized');
    },

    navigateTo(pageName) {
        if (this.currentPage === pageName) return;

        // Update page visibility
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const page = document.getElementById('page-' + pageName);
        if (page) page.classList.add('active');

        // Update nav
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const nav = document.querySelector(`.nav-item[data-page="${pageName}"]`);
        if (nav) nav.classList.add('active');

        this.currentPage = pageName;

        // Trigger page-specific logic
        if (pageName === 'flashcard') {
            Flashcard.onPageShow();
        } else if (pageName === 'dialogue') {
            Dialogue.onPageShow();
        } else if (pageName === 'import') {
            Import.loadHistory();
        }
    },

    // ===== Toast Notification =====
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const icon = document.getElementById('toast-icon');
        const msg = document.getElementById('toast-message');

        icon.textContent = type === 'success' ? '✅' : '❌';
        msg.textContent = message;

        // Remove hidden, force reflow, then add show
        toast.className = `toast toast-${type}`;
        toast.offsetHeight; // force reflow
        toast.classList.add('show');

        clearTimeout(this._toastTimer);
        clearTimeout(this._toastHideTimer);
        this._toastTimer = setTimeout(() => {
            toast.classList.remove('show');
            // After slide-out animation, fully hide the element
            this._toastHideTimer = setTimeout(() => {
                toast.classList.add('hidden');
            }, 400);
        }, 2500);
    },

    // ===== Confirm Modal =====
    showConfirm(title, message, onConfirm) {
        const modal = document.getElementById('confirm-modal');
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-message').textContent = message;

        modal.classList.remove('hidden');

        const confirmBtn = document.getElementById('modal-confirm');
        const cancelBtn = document.getElementById('modal-cancel');
        const backdrop = modal.querySelector('.modal-backdrop');

        const cleanup = () => {
            modal.classList.add('hidden');
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            backdrop.removeEventListener('click', handleCancel);
        };

        const handleConfirm = () => {
            cleanup();
            onConfirm();
        };

        const handleCancel = () => {
            cleanup();
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        backdrop.addEventListener('click', handleCancel);
    },

    // ===== Service Worker =====
    async registerSW() {
        if ('serviceWorker' in navigator) {
            try {
                const reg = await navigator.serviceWorker.register('/sw.js');
                // Force check for update
                reg.update();
                console.log('Service Worker registered, scope:', reg.scope);
            } catch (err) {
                console.warn('SW registration failed:', err);
            }
        }
    }
};

// ===== Start App =====
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

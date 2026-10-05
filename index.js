(function() {
    'use strict';

    // ============================================================
    // Quote Guard — TauriTavern / SillyTavern
    // Blocks the Send button BEFORE the message is added to chat.
    // No MESSAGE_SENT, no stopGeneration, no cleanup.
    // ============================================================

    const LOG = '[QuoteGuard]';

    // --- Context ---
    function getContext() {
        return window.SillyTavern?.getContext()
            || window.getContext?.()
            || null;
    }

    // --- Notification ---
    function notify(msg) {
        const ctx = getContext();
        try {
            if (typeof ctx?.toast === 'function') { ctx.toast(msg, 'error'); return; }
            if (typeof window.toastr?.error === 'function') { window.toastr.error(msg); return; }
        } catch { /* ignore */ }
        console.warn(LOG, msg);
    }

    // --- Quote check ---
    function hasUnbalancedDoubleQuotes(text) {
        if (typeof text !== 'string' || text.length === 0) return false;
        const cleaned = text.replace(/\\"/g, '');
        let count = 0;
        for (let i = 0; i < cleaned.length; i++) {
            if (cleaned.charCodeAt(i) === 0x22) count++;
        }
        return count % 2 !== 0;
    }

    // --- Send-button finder (desktop + mobile variants) ---
    function findSendButton() {
        // Try the common selectors in order of specificity.
        const candidates = [
            '#send_but',
            '.send_but',
            '.st-send-button',
            '[data-testid="send-button"]',
            'button[type="submit"]',
        ];
        for (const sel of candidates) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return null;
    }

    // --- The interceptor (attached directly to the button) ---
    let lastBlockedAt = 0;

    function intercept(e) {
        const textarea = document.querySelector('#send_textarea');
        if (!textarea) return;
        if (!hasUnbalancedDoubleQuotes(textarea.value)) return;

        // Block the event before ST's handler sees it.
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();

        const now = Date.now();
        if (now - lastBlockedAt > 300) {
            lastBlockedAt = now;
            notify('Unclosed double quote detected — message not sent.');
        }
    }

    // --- Attach listeners directly to the button ---
    let attachedButton = null;

    function attachToButton(btn) {
        if (btn === attachedButton) return; // already done
        attachedButton = btn;

        // Capture phase on the button itself — fires before any
        // listener ST has bound to the same element, and before
        // the event bubbles up to document.
        btn.addEventListener('pointerdown', intercept, true);
        btn.addEventListener('touchstart', intercept, true);
        btn.addEventListener('touchend', intercept, true);
        btn.addEventListener('click', intercept, true);
        console.log(`${LOG} interceptors attached to send button.`);
    }

    // --- MutationObserver: catch the button whenever it appears ---
    function observeForSendButton() {
        const tryAttach = () => {
            const btn = findSendButton();
            if (btn) attachToButton(btn);
        };

        // Initial attempt.
        tryAttach();

        // Watch for DOM changes (ST may re-render the input area,
        // especially on mobile orientation changes).
        const observer = new MutationObserver(() => {
            tryAttach();
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    // --- Init ---
    function init() {
        observeForSendButton();
        console.log(`✅ ${LOG} ready.`);
    }

    // Boot after DOM is ready.
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

    // Re-arm after ST fully boots (TauriTavern may load later).
    document.addEventListener('SillyTavernReady', () => setTimeout(init, 500));
})();
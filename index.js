(function() {
    'use strict';

    // ============================================================
    // Quote Guard — TauriTavern / SillyTavern
    // Blocks the Send button BEFORE the message is added to chat.
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

    // --- Send-button finder ---
    function findSendButton() {
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

    // --- Interceptor ---
    let lastBlockedAt = 0;

    function intercept(e) {
        const textarea = document.querySelector('#send_textarea');
        if (!textarea) return;
        if (!hasUnbalancedDoubleQuotes(textarea.value)) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();

        const now = Date.now();
        if (now - lastBlockedAt > 300) {
            lastBlockedAt = now;
            notify('Unclosed double quote detected — message not sent.');
        }
    }

    // --- State ---
    let initialised = false;
    let attachedButton = null;
    let observer = null;

    // --- Attach ---
    function attachToButton(btn) {
        if (!btn || btn === attachedButton) return;
        attachedButton = btn;
        btn.addEventListener('pointerdown', intercept, true);
        btn.addEventListener('touchstart', intercept, true);
        btn.addEventListener('touchend', intercept, true);
        btn.addEventListener('click', intercept, true);
        console.log(`${LOG} interceptors attached to send button.`);
    }

    // --- Observer lifecycle ---
    function ensureObserver() {
        if (observer || !document.body) return;
        observer = new MutationObserver(() => {
            const btn = findSendButton();
            if (!btn) return;
            attachToButton(btn);
            if (attachedButton && attachedButton.isConnected) {
                observer.disconnect();
                observer = null;
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // --- Rearm if the button was replaced ---
    function rearmIfDetached() {
        if (attachedButton && !attachedButton.isConnected) {
            attachedButton = null;
        }
        if (!attachedButton) {
            ensureObserver();
        }
    }

    // --- Init (idempotent) ---
    function init() {
        if (initialised) return;
        initialised = true;

        const btn = findSendButton();
        if (btn) {
            attachToButton(btn);
        } else {
            ensureObserver();
        }

        // Mobile orientation changes rebuild the input area.
        window.addEventListener('orientationchange', () => {
            setTimeout(rearmIfDetached, 500);
        });

        // Watchdog for any other rebuild we didn't anticipate.
        setInterval(rearmIfDetached, 2000);

        console.log(`✅ ${LOG} ready.`);
    }

    // ST extensions load after DOMContentLoaded, so readyState is
    // always 'interactive' or 'complete' by the time this IIFE runs.
    // The DOMContentLoaded branch was dead code.
    init();

    // Idempotent: no-op if init already ran.
    document.addEventListener('SillyTavernReady', init);
})();
(function() {
    'use strict';

    // ============================================================
    // SillyTavern Extension: Quote Guard
    // Blocks the Send button from firing if the message contains
    // an unclosed double quote. Only the send button is guarded —
    // the Enter key is left untouched (important on Android, where
    // Enter inserts a newline).
    // ============================================================

    const LOG = '[QuoteGuard]';

    // --- Context (global, never imported) ---

    function getContext() {
        return window.SillyTavern?.getContext() || null;
    }

    // --- Toast / notification with fallbacks ---

    function notify(msg) {
        const ctx = getContext();
        try {
            if (typeof ctx?.toast === 'function') {
                ctx.toast(msg, 'error');
                return;
            }
            if (typeof window.toastr?.error === 'function') {
                window.toastr.error(msg);
                return;
            }
        } catch { /* fall through */ }
        console.warn(LOG, msg);
    }

    // --- Quote check ---

    function hasUnbalancedDoubleQuotes(text) {
        if (typeof text !== 'string' || text.length === 0) return false;
        // Ignore escaped quotes like \" so "He said \"hi\"" counts as balanced.
        const cleaned = text.replace(/\\"/g, '');
        let count = 0;
        for (let i = 0; i < cleaned.length; i++) {
            if (cleaned.charCodeAt(i) === 0x22) count++;
        }
        return count % 2 !== 0;
    }

    // --- Send button interceptor ---

    let lastBlockedAt = 0;

    function intercept(e) {
        // Only care about events targeting the send button.
        // `closest` handles clicks on child elements (SVG icon etc.).
        const btn = e.target?.closest?.('#send_but');
        if (!btn) return;

        const textarea = document.querySelector('#send_textarea');
        if (!textarea) return;
        if (!hasUnbalancedDoubleQuotes(textarea.value)) return;

        // Block the event before ST's own handler runs.
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();

        // Throttle the toast so pointerdown+click don't double-fire it.
        const now = Date.now();
        if (now - lastBlockedAt > 250) {
            lastBlockedAt = now;
            notify('Unclosed double quote detected — message not sent.');
        }
    }

    // --- Setup ---

    function setup() {
        if (document.body?.dataset.quoteGuardAttached) return true;

        // Capture phase on `document` guarantees we run before any
        // listener ST attached to the button itself. We watch both
        // `pointerdown` and `click` because different ST builds bind
        // to different events, and some UIs fire one before the other.
        document.addEventListener('pointerdown', intercept, true);
        document.addEventListener('click', intercept, true);

        if (document.body) {
            document.body.dataset.quoteGuardAttached = 'true';
        }
        return true;
    }

    // --- Init with retry loop (same pattern as delete-from-here) ---

    let attempts = 0;
    let interval = null;

    function init() {
        if (interval) clearInterval(interval);
        interval = setInterval(() => {
            attempts++;
            try {
                if (setup()) {
                    clearInterval(interval);
                    interval = null;
                    console.log(`✅ ${LOG} ready.`);
                } else if (attempts >= 30) {
                    clearInterval(interval);
                    interval = null;
                    console.error(`❌ ${LOG} failed to initialise.`);
                }
            } catch (err) {
                console.error(LOG, 'init error:', err);
            }
        }, 1000);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

    document.addEventListener('SillyTavernReady', () => setTimeout(init, 500));
})();
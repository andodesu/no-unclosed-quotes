(function() {
    'use strict';

    // ============================================================
    // SillyTavern Extension: Quote Guard
    // Blocks sending a user message that contains an unclosed
    // double quote. Intercepts before ST's send handler runs,
    // so no message is added and no generation is started.
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

    // --- Capture-phase interceptor ---

    function intercept(e) {
        let textarea = null;

        if (e.type === 'submit') {
            // Only care about the chat send form.
            if (e.target?.id !== 'send_form') return;
            textarea = document.querySelector('#send_textarea');
        } else if (e.type === 'keydown') {
            // Only care about Enter (without Shift) in the send box.
            if (e.target?.id !== 'send_textarea') return;
            if (e.key !== 'Enter' || e.shiftKey) return;
            textarea = e.target;
        } else {
            return;
        }

        if (!textarea) return;
        if (!hasUnbalancedDoubleQuotes(textarea.value)) return;

        // Block the event before ST's handlers ever see it.
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();

        notify('Unclosed double quote detected — message not sent.');
    }

    // --- Setup ---

    function setup() {
        // Attach on `document` in capture phase so we always run first,
        // regardless of when ST bound its own listeners.
        if (document.body?.dataset.quoteGuardAttached) return true;

        document.addEventListener('submit', intercept, true);
        document.addEventListener('keydown', intercept, true);

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

    // ST fires this once its UI has fully booted; re-arm in case we
    // ran before the chat DOM existed.
    document.addEventListener('SillyTavernReady', () => setTimeout(init, 500));
})();
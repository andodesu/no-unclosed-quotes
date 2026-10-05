(function() {
    'use strict';

    // ============================================================
    // SillyTavern Extension: Quote Guard
    // Blocks the send button on desktop *and* mobile if the
    // message has an unclosed double quote. The Enter key is
    // deliberately left alone so Android can keep its newline.
    // ============================================================

    const LOG = '[QuoteGuard]';

    // --- Context ---
    function getContext() {
        return window.SillyTavern?.getContext() || null;
    }

    // --- Toast ---
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

    // --- Send-button detection (desktop + mobile) ---
    // We match any element that looks like the send button.
    function isSendButton(el) {
        if (!el) return false;
        // Desktop: #send_but
        if (el.id === 'send_but') return true;
        // Mobile / alt builds: class-based or data-attribute
        if (el.classList?.contains('send_but')) return true;
        if (el.classList?.contains('st-send-button')) return true;
        if (el.dataset?.testid === 'send-button') return true;
        // Fallback: any <button type="submit"> inside the chat form
        if (el.tagName === 'BUTTON' && el.type === 'submit') return true;
        return false;
    }

    // --- Interceptor ---
    let lastBlockedAt = 0;

    function intercept(e) {
        // Walk up from the event target to find the button.
        let node = e.target;
        let btn = null;
        while (node && node !== document) {
            if (isSendButton(node)) { btn = node; break; }
            node = node.parentElement;
        }
        if (!btn) return;

        const textarea = document.querySelector('#send_textarea');
        if (!textarea) return;
        if (!hasUnbalancedDoubleQuotes(textarea.value)) return;

        // Block the event before ST's handler sees it.
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();

        // Throttle so touchstart + touchend + click don't triple-toast.
        const now = Date.now();
        if (now - lastBlockedAt > 300) {
            lastBlockedAt = now;
            notify('Unclosed double quote detected — message not sent.');
        }
    }

    // --- Setup ---
    function setup() {
        if (document.body?.dataset.quoteGuardAttached) return true;

        // Capture phase on document so we always run first.
        // Cover every event family a mobile browser might use.
        document.addEventListener('pointerdown', intercept, true);
        document.addEventListener('touchstart', intercept, true);
        document.addEventListener('touchend', intercept, true);
        document.addEventListener('click', intercept, true);

        if (document.body) {
            document.body.dataset.quoteGuardAttached = 'true';
        }
        console.log(`${LOG} listeners attached.`);
        return true;
    }

    // --- Init with retry loop ---
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
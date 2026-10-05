(function() {
    'use strict';

    // ============================================================
    // Quote Guard — TauriTavern / SillyTavern
    // Blocks the Send button BEFORE the message is added to chat,
    // and briefly highlights the offending quotes in the textarea.
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

    // --- Quote helpers ---
    function isDoubleQuote(ch) {
        return ch === '"'
            || ch === '\u201C' || ch === '\u201D'
            || ch === '\u201E' || ch === '\u201F'
            || ch === '\u00AB' || ch === '\u00BB';
    }

    // Returns positions of quotes that never found a partner.
    // Greedy left-to-right pairing: first quote opens, next closes, etc.
    // Escaped \" is skipped (treated as literal, not a quote).
    function findUnmatchedQuotePositions(text) {
        const stack = [];
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === '\\' && text[i + 1] === '"') { i++; continue; }
            if (!isDoubleQuote(ch)) continue;
            if (stack.length > 0) stack.pop();
            else stack.push(i);
        }
        return stack;
    }

    // Returns positions of adjacent quote pairs ("" or "").
    function findEmptyQuotePositions(text) {
        const positions = [];
        for (let i = 0; i < text.length - 1; i++) {
            const ch = text[i];
            if (ch === '\\' && text[i + 1] === '"') { i++; continue; }
            if (!isDoubleQuote(ch)) continue;
            if (isDoubleQuote(text[i + 1])) {
                positions.push(i, i + 1);
                i++;
            }
        }
        return positions;
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

    // --- Flash the offending quotes via native selection ---
    const FLASH_DURATION = 900;
    const FLASH_MAX_SPAN = 40; // if positions span more than this, only flash the first

    function flashPositions(textarea, positions) {
        if (!positions.length) return;

        const sorted = positions.slice().sort((a, b) => a - b);
        const first = sorted[0];
        const last = sorted[sorted.length - 1] + 1;

        // Save the user's current selection so we can restore it.
        const savedStart = textarea.selectionStart;
        const savedEnd = textarea.selectionEnd;

        // Focus the textarea so the selection is actually visible.
        textarea.focus();

        // If the offending quotes are close together, select the whole span;
        // otherwise just flash the first one.
        let flashStart, flashEnd;
        if (last - first <= FLASH_MAX_SPAN) {
            flashStart = first;
            flashEnd = last;
        } else {
            flashStart = first;
            flashEnd = first + 1;
        }
        textarea.setSelectionRange(flashStart, flashEnd);

        // Restore the original cursor after the flash, but only if the
        // user hasn't already started interacting with the textarea.
        setTimeout(() => {
            if (textarea.selectionStart === flashStart
                && textarea.selectionEnd === flashEnd) {
                try {
                    textarea.setSelectionRange(savedStart, savedEnd);
                } catch { /* ignore */ }
            }
        }, FLASH_DURATION);
    }

    // --- Interceptor ---
    let lastBlockedAt = 0;

    function block(e, message) {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        const now = Date.now();
        if (now - lastBlockedAt > 300) {
            lastBlockedAt = now;
            notify(message);
        }
    }

    function intercept(e) {
        const textarea = document.querySelector('#send_textarea');
        if (!textarea) return;
        const value = textarea.value;

        const unmatched = findUnmatchedQuotePositions(value);
        if (unmatched.length) {
            block(e, 'Unclosed double quote detected — message not sent.');
            flashPositions(textarea, unmatched);
            return;
        }

        const empty = findEmptyQuotePositions(value);
        if (empty.length) {
            block(e, 'Empty quotes detected — message not sent.');
            flashPositions(textarea, empty);
            return;
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

        window.addEventListener('orientationchange', () => {
            setTimeout(rearmIfDetached, 500);
        });

        setInterval(rearmIfDetached, 2000);

        console.log(`✅ ${LOG} ready.`);
    }

    init();

    document.addEventListener('SillyTavernReady', init);
})();
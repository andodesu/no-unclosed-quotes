(function() {
    'use strict';

    const LOG = '[QuoteGuard]';
    const FLASH_DURATION = 900;
    const FLASH_MAX_SPAN = 40;

    // --- Style injection (deferred, defensive) ---
    function injectFlashStyle() {
        try {
            if (document.getElementById('quote-guard-style')) return true;
            const head = document.head || document.getElementsByTagName('head')[0];
            if (!head) return false;
            const style = document.createElement('style');
            style.id = 'quote-guard-style';
            style.textContent = [
                '@keyframes quoteGuardFlash {',
                '  0%   { outline-color: rgba(220, 60, 60, 0.9); }',
                '  100% { outline-color: rgba(220, 60, 60, 0); }',
                '}',
                '#send_textarea.quote-guard-flash {',
                '  outline: 3px solid rgba(220, 60, 60, 0.9);',
                '  outline-offset: 2px;',
                `  animation: quoteGuardFlash ${FLASH_DURATION}ms ease-out forwards;`,
                '}',
            ].join('\n');
            head.appendChild(style);
            return true;
        } catch (err) {
            console.warn(LOG, 'style injection failed:', err);
            return false;
        }
    }

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

    // --- Flash ---
    function isTauriMobile() {
        if (typeof window.__TAURITAVERN__ === 'undefined') return false;
        return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    }

    function flashTextareaOutline(textarea) {
        textarea.classList.add('quote-guard-flash');
        setTimeout(() => {
            textarea.classList.remove('quote-guard-flash');
        }, FLASH_DURATION);
    }

    function flashPositions(textarea, positions) {
        if (!positions.length) return;

        if (isTauriMobile()) {
            flashTextareaOutline(textarea);
            return;
        }

        const sorted = positions.slice().sort((a, b) => a - b);
        const first = sorted[0];
        const last = sorted[sorted.length - 1] + 1;

        const savedStart = textarea.selectionStart;
        const savedEnd = textarea.selectionEnd;

        textarea.focus();

        let flashStart, flashEnd;
        if (last - first <= FLASH_MAX_SPAN) {
            flashStart = first;
            flashEnd = last;
        } else {
            flashStart = first;
            flashEnd = first + 1;
        }
        textarea.setSelectionRange(flashStart, flashEnd);

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
        try {
            const textarea = document.querySelector('#send_textarea');
            if (!textarea) return;
            const value = textarea.value;

            const unmatched = findUnmatchedQuotePositions(value);
            if (unmatched.length) {
                block(e, 'Unclosed double quote detected — message not sent.');
                try { flashPositions(textarea, unmatched); }
                catch (err) { console.warn(LOG, 'flash failed:', err); }
                return;
            }

            const empty = findEmptyQuotePositions(value);
            if (empty.length) {
                block(e, 'Empty quotes detected — message not sent.');
                try { flashPositions(textarea, empty); }
                catch (err) { console.warn(LOG, 'flash failed:', err); }
                return;
            }
        } catch (err) {
            console.error(LOG, 'intercept error:', err);
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

        console.log(`${LOG} init starting...`);

        try { injectFlashStyle(); }
        catch (err) { console.warn(LOG, 'injectFlashStyle threw:', err); }

        try {
            const btn = findSendButton();
            console.log(`${LOG} findSendButton →`, btn);
            if (btn) {
                attachToButton(btn);
            } else {
                console.log(`${LOG} button not found, arming observer.`);
                ensureObserver();
            }
        } catch (err) {
            console.error(LOG, 'button attach failed:', err);
        }

        try {
            window.addEventListener('orientationchange', () => {
                setTimeout(rearmIfDetached, 500);
            });
            setInterval(rearmIfDetached, 2000);
        } catch (err) {
            console.warn(LOG, 'watchdog setup failed:', err);
        }

        console.log(`✅ ${LOG} ready.`);
    }

    try {
        init();
    } catch (err) {
        console.error(LOG, 'init failed:', err);
    }

    document.addEventListener('SillyTavernReady', init);
})();
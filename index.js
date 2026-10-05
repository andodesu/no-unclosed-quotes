(function() {
    'use strict';

    const LOG = '[QuoteGuard]';
    const FLASH_DURATION = 900;
    const OVERLAY_CLASS = 'quote-guard-overlay';
    const HIGHLIGHT_CLASS = 'quote-guard-highlight';

    // --- Style injection ---
    function injectFlashStyle() {
        try {
            if (document.getElementById('quote-guard-style')) return true;
            const head = document.head || document.getElementsByTagName('head')[0];
            if (!head) return false;
            const style = document.createElement('style');
            style.id = 'quote-guard-style';
            style.textContent = [
                `.${OVERLAY_CLASS} {`,
                '  position: fixed;',
                '  pointer-events: none;',
                '  overflow: hidden;',
                '  z-index: 9999;',
                '  white-space: pre-wrap;',
                '  word-wrap: break-word;',
                '  background: transparent !important;',
                '}',
                // Force ALL text inside the overlay to be invisible,
                // regardless of theme rules. -webkit-text-fill-color is
                // the property WebKit actually uses for text rendering;
                // plain `color` alone can be overridden by theme rules.
                `.${OVERLAY_CLASS},`,
                `.${OVERLAY_CLASS} * {`,
                '  color: transparent !important;',
                '  -webkit-text-fill-color: transparent !important;',
                '  text-shadow: none !important;',
                '  caret-color: transparent !important;',
                '}',
                `.${HIGHLIGHT_CLASS} {`,
                // Fallback for WebViews without color-mix().
                '  background-color: rgba(204, 51, 51, 0.2);',
                // Tint the error red at 20% opacity where supported.
                '  background-color: color-mix(in srgb, var(--fullred, #cc3333) 20%, transparent);',
                '  border-radius: 2px;',
                '}',
                '@keyframes quoteGuardFade {',
                '  0% { opacity: 1; }',
                '  80% { opacity: 1; }',
                '  100% { opacity: 0; }',
                '}',
                `.${OVERLAY_CLASS}.quote-guard-fade {`,
                `  animation: quoteGuardFade ${FLASH_DURATION}ms ease-out forwards;`,
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

    // --- Flash: overlay with per-character highlight ---
    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function buildOverlay(textarea, positions) {
        const sorted = positions.slice().sort((a, b) => a - b);
        const text = textarea.value;

        // Merge adjacent/overlapping positions into ranges.
        const ranges = [];
        for (const pos of sorted) {
            const last = ranges[ranges.length - 1];
            if (last && pos <= last.end + 1) {
                last.end = Math.max(last.end, pos);
            } else {
                ranges.push({ start: pos, end: pos });
            }
        }

        let html = '';
        let cursor = 0;
        for (const r of ranges) {
            html += escapeHtml(text.slice(cursor, r.start));
            html += `<span class="${HIGHLIGHT_CLASS}">`;
            html += escapeHtml(text.slice(r.start, r.end + 1));
            html += '</span>';
            cursor = r.end + 1;
        }
        html += escapeHtml(text.slice(cursor));

        const overlay = document.createElement('div');
        overlay.className = OVERLAY_CLASS;
        overlay.innerHTML = html;

        // Copy computed styles so the mirror lines up exactly.
        const cs = getComputedStyle(textarea);
        const props = [
            'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
            'lineHeight', 'letterSpacing', 'wordSpacing',
            'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
            'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
            'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
            'boxSizing', 'textAlign', 'textIndent', 'textTransform',
        ];
        for (const p of props) overlay.style[p] = cs[p];

        // Position using fixed coordinates from getBoundingClientRect.
        const rect = textarea.getBoundingClientRect();
        overlay.style.left = rect.left + 'px';
        overlay.style.top = rect.top + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';

        document.body.appendChild(overlay);

        // Match scroll position.
        overlay.scrollTop = textarea.scrollTop;
        overlay.scrollLeft = textarea.scrollLeft;

        // Keep scroll in sync for the short life of the overlay.
        const onScroll = () => {
            overlay.scrollTop = textarea.scrollTop;
            overlay.scrollLeft = textarea.scrollLeft;
        };
        textarea.addEventListener('scroll', onScroll, { passive: true });
        overlay._cleanup = () => textarea.removeEventListener('scroll', onScroll);

        return overlay;
    }

    function flashOverlay(textarea, positions) {
        let overlay = null;
        try {
            overlay = buildOverlay(textarea, positions);
            overlay.classList.add('quote-guard-fade');
        } catch (err) {
            console.warn(LOG, 'overlay flash failed:', err);
        }
        setTimeout(() => {
            if (overlay) {
                try { overlay._cleanup?.(); } catch { /* ignore */ }
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }
        }, FLASH_DURATION);
    }

    // --- Flash: overlay only ---
    function flashPositions(textarea, positions) {
        if (!positions.length) return;
        flashOverlay(textarea, positions);
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
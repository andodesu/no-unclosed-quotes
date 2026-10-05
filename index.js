(function() {
    'use strict';

    const LOG = '[QuoteGuard]';
    const FLASH_DURATION = 900;
    const OVERLAY_CLASS = 'quote-guard-overlay';
    const QUOTED_CLASS = 'quote-guard-quoted';
    const ALERT_CLASS = 'quote-guard-alert';

    // ────────────────────────────────────────────────────────────
    // Style injection
    // ────────────────────────────────────────────────────────────

    function injectStyle() {
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
                '  overflow-wrap: break-word;',
                '  color: transparent;',
                '  background: transparent;',
                '}',
                `.${QUOTED_CLASS} {`,
                '  background-color: rgba(220, 60, 60, 0.30);',
                '  background-color: color-mix(in srgb, var(--SmartThemeQuoteColor, #dc3c3c) 30%, transparent);',
                '  border-radius: 2px;',
                '}',
                `.${ALERT_CLASS} {`,
                '  background-color: rgba(220, 60, 60, 0.75);',
                '  animation: quoteGuardPulse 300ms ease-in-out 3;',
                '  border-radius: 2px;',
                '}',
                '@keyframes quoteGuardPulse {',
                '  0%, 100% { opacity: 1; }',
                '  50% { opacity: 0.35; }',
                '}',
            ].join('\n');
            head.appendChild(style);
            return true;
        } catch (err) {
            console.warn(LOG, 'style injection failed:', err);
            return false;
        }
    }

    // ────────────────────────────────────────────────────────────
    // Context / notify
    // ────────────────────────────────────────────────────────────

    function getContext() {
        return window.SillyTavern?.getContext() || window.getContext?.() || null;
    }

    function notify(msg) {
        const ctx = getContext();
        try {
            if (typeof ctx?.toast === 'function') { ctx.toast(msg, 'error'); return; }
            if (typeof window.toastr?.error === 'function') { window.toastr.error(msg); return; }
        } catch { /* ignore */ }
        console.warn(LOG, msg);
    }

    // ────────────────────────────────────────────────────────────
    // Quote scanning
    // ────────────────────────────────────────────────────────────

    function isDoubleQuote(ch) {
        return ch === '"'
            || ch === '\u201C' || ch === '\u201D'
            || ch === '\u201E' || ch === '\u201F'
            || ch === '\u00AB' || ch === '\u00BB';
    }

    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function scanQuotes(text) {
        const ranges = [];
        const unmatched = [];
        let openStart = -1;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === '\\' && text[i + 1] === '"') { i++; continue; }
            if (!isDoubleQuote(ch)) continue;
            if (openStart === -1) {
                openStart = i;
            } else {
                if (i > openStart + 1) {
                    ranges.push({ start: openStart + 1, end: i });
                }
                openStart = -1;
            }
        }
        if (openStart !== -1) {
            unmatched.push(openStart);
            if (openStart + 1 < text.length) {
                ranges.push({ start: openStart + 1, end: text.length });
            }
        }
        return { ranges, unmatched };
    }

    function buildOverlayHtml(text, alertPositions) {
        const { ranges } = scanQuotes(text);
        const marks = [];
        for (const r of ranges) {
            marks.push({ start: r.start, end: r.end, cls: QUOTED_CLASS });
        }
        if (alertPositions && alertPositions.length) {
            for (const p of alertPositions) {
                marks.push({ start: p, end: p + 1, cls: ALERT_CLASS });
            }
        }
        marks.sort((a, b) => a.start - b.start);

        let html = '';
        let cursor = 0;
        for (const m of marks) {
            if (m.start < cursor) continue;
            html += escapeHtml(text.slice(cursor, m.start));
            html += `<span class="${m.cls}">`;
            html += escapeHtml(text.slice(m.start, m.end));
            html += '</span>';
            cursor = m.end;
        }
        html += escapeHtml(text.slice(cursor));
        return html;
    }

    // ────────────────────────────────────────────────────────────
    // Send button
    // ────────────────────────────────────────────────────────────

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

    // ────────────────────────────────────────────────────────────
    // Overlay
    // ────────────────────────────────────────────────────────────

    let overlayEl = null;
    let textareaEl = null;
    let alertTimer = null;
    let alertPositions = null;
    let resizeObserver = null;

    function ensureOverlay() {
        if (overlayEl && overlayEl.isConnected) return overlayEl;
        if (!document.body) return null;
        overlayEl = document.createElement('div');
        overlayEl.className = OVERLAY_CLASS;
        document.body.appendChild(overlayEl);
        return overlayEl;
    }

    function applyOverlayTextStyle() {
        if (!overlayEl || !textareaEl) return;
        try {
            const cs = getComputedStyle(textareaEl);
            const props = [
                'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
                'lineHeight', 'letterSpacing', 'wordSpacing',
                'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
                'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
                'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
                'boxSizing', 'textAlign', 'textIndent', 'textTransform',
            ];
            for (const p of props) overlayEl.style[p] = cs[p];
            overlayEl.style.borderTopColor = 'transparent';
            overlayEl.style.borderRightColor = 'transparent';
            overlayEl.style.borderBottomColor = 'transparent';
            overlayEl.style.borderLeftColor = 'transparent';
        } catch (err) {
            console.warn(LOG, 'overlay style copy failed:', err);
        }
    }

    function applyOverlayGeometry() {
        if (!overlayEl || !textareaEl || !overlayEl.isConnected) return;
        const rect = textareaEl.getBoundingClientRect();
        overlayEl.style.left = rect.left + 'px';
        overlayEl.style.top = rect.top + 'px';
        overlayEl.style.width = rect.width + 'px';
        overlayEl.style.height = rect.height + 'px';
        overlayEl.scrollTop = textareaEl.scrollTop;
        overlayEl.scrollLeft = textareaEl.scrollLeft;
    }

    function renderOverlay() {
        if (!overlayEl || !textareaEl) return;
        overlayEl.innerHTML = buildOverlayHtml(textareaEl.value, alertPositions);
        overlayEl.scrollTop = textareaEl.scrollTop;
        overlayEl.scrollLeft = textareaEl.scrollLeft;
    }

    function onInput() {
        if (alertTimer) {
            clearTimeout(alertTimer);
            alertTimer = null;
            alertPositions = null;
        }
        renderOverlay();
    }

    function onScroll() {
        if (!overlayEl || !textareaEl) return;
        overlayEl.scrollTop = textareaEl.scrollTop;
        overlayEl.scrollLeft = textareaEl.scrollLeft;
    }

    function reposition() {
        applyOverlayTextStyle();
        applyOverlayGeometry();
    }

    // Focus can trigger a background/geometry change in ST or a
    // soft-keyboard-driven layout shift on mobile. Reposition on a
    // few timeouts to catch whatever settles last.
    function onFocus() {
        reposition();
        setTimeout(reposition, 60);
        setTimeout(reposition, 200);
        setTimeout(reposition, 400);
    }

    function flashAlert(positions) {
        alertPositions = positions;
        renderOverlay();
        if (alertTimer) clearTimeout(alertTimer);
        alertTimer = setTimeout(() => {
            alertTimer = null;
            alertPositions = null;
            renderOverlay();
        }, FLASH_DURATION);
    }

    function attachToTextarea() {
        const el = document.querySelector('#send_textarea');
        if (!el) return false;
        if (el === textareaEl && el.isConnected) return true;

        if (textareaEl) {
            textareaEl.removeEventListener('input', onInput);
            textareaEl.removeEventListener('scroll', onScroll);
            textareaEl.removeEventListener('focus', onFocus);
        }

        textareaEl = el;
        textareaEl.addEventListener('input', onInput);
        textareaEl.addEventListener('scroll', onScroll, { passive: true });
        textareaEl.addEventListener('focus', onFocus);

        ensureOverlay();
        applyOverlayTextStyle();
        applyOverlayGeometry();
        renderOverlay();

        if (resizeObserver) resizeObserver.disconnect();
        try {
            resizeObserver = new ResizeObserver(() => {
                applyOverlayTextStyle();
                applyOverlayGeometry();
                renderOverlay();
            });
            resizeObserver.observe(textareaEl);
        } catch (err) {
            console.warn(LOG, 'ResizeObserver unavailable:', err);
        }

        console.log(`${LOG} overlay attached to textarea.`);
        return true;
    }

    // ────────────────────────────────────────────────────────────
    // Guard
    // ────────────────────────────────────────────────────────────

    function findUnmatchedQuotePositions(text) {
        return scanQuotes(text).unmatched;
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
                try { flashAlert(unmatched); }
                catch (err) { console.warn(LOG, 'flash failed:', err); }
                return;
            }

            const empty = findEmptyQuotePositions(value);
            if (empty.length) {
                block(e, 'Empty quotes detected — message not sent.');
                try { flashAlert(empty); }
                catch (err) { console.warn(LOG, 'flash failed:', err); }
                return;
            }
        } catch (err) {
            console.error(LOG, 'intercept error:', err);
        }
    }

    // ────────────────────────────────────────────────────────────
    // Button attach + observer
    // ────────────────────────────────────────────────────────────

    let attachedButton = null;
    let observer = null;

    function attachToButton(btn) {
        if (!btn || btn === attachedButton) return;
        attachedButton = btn;
        btn.addEventListener('pointerdown', intercept, true);
        btn.addEventListener('touchstart', intercept, true);
        btn.addEventListener('touchend', intercept, true);
        btn.addEventListener('click', intercept, true);
        console.log(`${LOG} interceptors attached to send button.`);
    }

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

    // ────────────────────────────────────────────────────────────
    // Init / watchdog
    // ────────────────────────────────────────────────────────────

    let initialised = false;

    function watchdog() {
        if (attachedButton && !attachedButton.isConnected) attachedButton = null;
        if (!attachedButton) {
            const btn = findSendButton();
            if (btn) attachToButton(btn);
            else ensureObserver();
        }
        if (!textareaEl || !textareaEl.isConnected) {
            attachToTextarea();
        }
        if (!overlayEl || !overlayEl.isConnected) {
            ensureOverlay();
            applyOverlayTextStyle();
            applyOverlayGeometry();
            renderOverlay();
        }
    }

    function init() {
        if (initialised) return;
        initialised = true;
        console.log(`${LOG} init starting...`);

        try { injectStyle(); } catch (e) { console.warn(LOG, 'injectStyle failed:', e); }
        try { attachToTextarea(); } catch (e) { console.warn(LOG, 'attachToTextarea failed:', e); }

        try {
            const btn = findSendButton();
            if (btn) attachToButton(btn);
            else {
                console.log(`${LOG} button not found, arming observer.`);
                ensureObserver();
            }
        } catch (e) { console.warn(LOG, 'button attach failed:', e); }

        try {
            window.addEventListener('resize', reposition);
            window.addEventListener('orientationchange', () => {
                setTimeout(reposition, 100);
                setTimeout(reposition, 400);
            });
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', reposition);
                window.visualViewport.addEventListener('scroll', reposition);
            }
        } catch (e) { console.warn(LOG, 'position listeners failed:', e); }

        setTimeout(reposition, 500);
        setInterval(watchdog, 2000);

        console.log(`✅ ${LOG} ready.`);
    }

    try {
        init();
    } catch (err) {
        console.error(LOG, 'init failed:', err);
    }

    document.addEventListener('SillyTavernReady', init);
})();
// --- Flash with overlay (works in TauriTavern) ---

const FLASH_DURATION = 900;
const OVERLAY_CLASS = 'quote-guard-overlay';
const HIGHLIGHT_CLASS = 'quote-guard-highlight';

// Inject overlay + highlight styles (call this from init, after FLASH_DURATION is defined)
function injectFlashStyle() {
    if (document.getElementById('quote-guard-style')) return;
    const head = document.head || document.getElementsByTagName('head')[0];
    if (!head) return;
    const style = document.createElement('style');
    style.id = 'quote-guard-style';
    style.textContent = [
        `.${OVERLAY_CLASS} {`,
        '  position: absolute;',
        '  pointer-events: none;',
        '  overflow: hidden;',
        '  z-index: 1;',
        '  white-space: pre-wrap;',
        '  word-wrap: break-word;',
        '  color: transparent;',
        '  background: transparent;',
        '}',
        `.${HIGHLIGHT_CLASS} {`,
        '  background-color: rgba(220, 60, 60, 0.45);',
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
}

// Build the overlay, mirroring the textarea's text with highlighted spans.
function buildOverlay(textarea, positions) {
    const sorted = positions.slice().sort((a, b) => a - b);
    const text = textarea.value;

    // Build the mirrored HTML.
    let html = '';
    let lastIndex = 0;
    // Merge overlapping positions into ranges.
    const ranges = [];
    for (const pos of sorted) {
        const last = ranges[ranges.length - 1];
        if (last && pos <= last.end + 1) {
            last.end = Math.max(last.end, pos);
        } else {
            ranges.push({ start: pos, end: pos });
        }
    }
    for (const r of ranges) {
        html += escapeHtml(text.slice(lastIndex, r.start));
        html += `<span class="${HIGHLIGHT_CLASS}">`;
        html += escapeHtml(text.slice(r.start, r.end + 1));
        html += '</span>';
        lastIndex = r.end + 1;
    }
    html += escapeHtml(text.slice(lastIndex));

    // Create the overlay element.
    const overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.innerHTML = html;

    // Copy the textarea's computed style so the mirror lines up exactly.
    const cs = getComputedStyle(textarea);
    const copyProps = [
        'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
        'lineHeight', 'letterSpacing', 'wordSpacing',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'boxSizing', 'textAlign', 'textIndent',
    ];
    for (const prop of copyProps) {
        overlay.style[prop] = cs[prop];
    }

    // Position the overlay exactly over the textarea.
    const rect = textarea.getBoundingClientRect();
    const parentRect = textarea.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    overlay.style.left = (rect.left - parentRect.left) + 'px';
    overlay.style.top = (rect.top - parentRect.top) + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    // Ensure the overlay is inside the same offset parent.
    const parent = textarea.offsetParent || document.body;
    parent.appendChild(overlay);

    // Match the textarea's scroll position.
    overlay.scrollTop = textarea.scrollTop;
    overlay.scrollLeft = textarea.scrollLeft;

    return overlay;
}

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function flashTextareaOutline(textarea) {
    if (!textarea) return;
    textarea.classList.remove('quote-guard-flash');
    void textarea.offsetWidth;
    textarea.classList.add('quote-guard-flash');
    setTimeout(() => textarea.classList.remove('quote-guard-flash'), FLASH_DURATION);
}

function flashPositions(textarea, positions) {
    if (!positions.length) return;

    // Always do the glow — it's cheap and works everywhere.
    flashTextareaOutline(textarea);

    // Try the overlay for precise highlighting.
    let overlay = null;
    try {
        overlay = buildOverlay(textarea, positions);
        overlay.classList.add('quote-guard-fade');
    } catch (err) {
        console.warn(LOG, 'overlay flash failed:', err);
    }

    // Clean up.
    setTimeout(() => {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, FLASH_DURATION);

    // On standard browsers, also try the native selection (it's a nice bonus).
    // It won't render in TauriTavern, but it's harmless.
    try {
        const sorted = positions.slice().sort((a, b) => a - b);
        const first = sorted[0];
        const last = sorted[sorted.length - 1] + 1;
        const savedStart = textarea.selectionStart;
        const savedEnd = textarea.selectionEnd;
        textarea.focus();
        textarea.setSelectionRange(first, first + 1);
        setTimeout(() => {
            if (textarea.selectionStart === first && textarea.selectionEnd === first + 1) {
                textarea.setSelectionRange(savedStart, savedEnd);
            }
        }, FLASH_DURATION);
    } catch { /* ignore */ }
}
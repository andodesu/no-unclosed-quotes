    // --- Flash the offending quotes ---
    const FLASH_DURATION = 900;

    // Detect TauriTavern mobile: the native IME layer owns focus/selection,
    // so programmatic setSelectionRange() does not render visually.
    function isTauriMobile() {
        if (typeof window.__TAURITAVERN__ === 'undefined') return false;
        // Mobile UA check — TauriTavern mobile uses Android/iOS WebView.
        return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    }

    // Fallback: brief CSS outline on the textarea itself.
    // No focus() call — works even when the native IME owns the element.
    function flashTextareaOutline(textarea) {
        textarea.classList.add('quote-guard-flash');
        setTimeout(() => {
            textarea.classList.remove('quote-guard-flash');
        }, FLASH_DURATION);
    }

    function flashPositions(textarea, positions) {
        if (!positions.length) return;

        if (isTauriMobile()) {
            // Selection-based flash doesn't render under TauriTavern's
            // native IME layer. Use the outline fallback instead.
            flashTextareaOutline(textarea);
            return;
        }

        // --- Upstream SillyTavern: selection-based flash ---
        const sorted = positions.slice().sort((a, b) => a - b);
        const first = sorted[0];
        const last = sorted[sorted.length - 1] + 1;

        const savedStart = textarea.selectionStart;
        const savedEnd = textarea.selectionEnd;

        textarea.focus();

        let flashStart, flashEnd;
        if (last - first <= 40) {
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
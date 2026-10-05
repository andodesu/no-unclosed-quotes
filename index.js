// index.js — no imports, no exports
(function () {
    'use strict';

    function init() {
        // Wait until ST has finished booting and the global context is ready
        if (typeof SillyTavern === 'undefined' || typeof SillyTavern.getContext !== 'function') {
            setTimeout(init, 200);
            return;
        }

        const context = SillyTavern.getContext();
        const { eventSource, event_types } = context;

        if (!eventSource || !event_types) {
            console.error('[Quote Guard] eventSource / event_types not available on context');
            return;
        }

        // --- your logic here ---

        function hasUnbalancedDoubleQuotes(text) {
            const cleaned = text.replace(/\\"/g, '');
            return ((cleaned.match(/"/g) || []).length % 2) !== 0;
        }

        function blockSend(e) {
            const textarea = document.querySelector('#send_textarea');
            if (!textarea) return;
            if (hasUnbalancedDoubleQuotes(textarea.value)) {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (typeof toastr !== 'undefined') {
                    toastr.error('Unclosed double quote detected — message not sent.');
                }
            }
        }

        // Attach capture-phase listener to the send form
        const form = document.querySelector('#send_form');
        if (form) {
            form.addEventListener('submit', blockSend, true);
        }

        // Safety net for Enter key on older builds
        const textarea = document.querySelector('#send_textarea');
        if (textarea) {
            textarea.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) blockSend(e);
            }, true);
        }

        console.log('[Quote Guard] loaded successfully');
    }

    // Kick off once jQuery has fired ready, or immediately if already ready
    if (typeof jQuery !== 'undefined') {
        jQuery(init);
    } else {
        init();
    }
})();
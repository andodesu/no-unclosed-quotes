import { eventSource, event_types } from '../../../script.js';
import { getContext } from '../../extensions.js';

// Helper: count occurrences of a character in a string
function countChar(str, char) {
    return (str.match(new RegExp(char, 'g')) || []).length;
}

// Handler for the MESSAGE_SENT event
async function onMessageSent(messageIndex) {
    const context = getContext();
    const message = context.chat[messageIndex];

    // Only validate user messages (not AI messages)
    if (message.is_user !== true) return;

    const text = message.mes;
    const quoteCount = countChar(text, '"');

    // If quotes are unbalanced, block the message
    if (quoteCount % 2 !== 0) {
        // 1️⃣ Notify the user
        toastr.error('Your message contains an unclosed double quote. Please fix it before sending.');

        // 2️⃣ Stop the AI generation that would normally follow
        context.stopGeneration();

        // 3️⃣ (Optional) Remove the invalid message from the chat
        // context.chat.splice(messageIndex, 1);
        // context.saveChat();   // Uncomment if you want to save the change
    }
}

// Subscribe to the event when the extension is loaded
eventSource.on(event_types.MESSAGE_SENT, onMessageSent);
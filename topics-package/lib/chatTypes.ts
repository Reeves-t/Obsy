/**
 * Shared chat message shape used by the Topics AI chat / Focus Mode flow
 * (services/topicChatClient.ts, app/topics/chat.tsx). Extracted from the
 * former moodverseStore so it survives the moodverse removal.
 */
export interface ChatMessage {
    id: string;
    role: 'assistant' | 'user';
    text: string;
}

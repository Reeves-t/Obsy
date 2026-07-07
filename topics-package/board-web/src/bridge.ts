// ── Obsy Board WebView bridge protocol ──────────────────────────────────────
// Shared message contract between the React Native host (TopicBoardPage.tsx) and
// the tldraw web bundle. Keep this in sync with the mirror in
// components/topics/board/boardBridge.ts on the RN side.

/** Messages sent from React Native INTO the WebView. */
export type RnToBoardMessage =
    | {
          type: 'init';
          /** Persisted tldraw snapshot from a previous session, or null for a fresh board. */
          snapshot: unknown | null;
          /** Topic hue (0-360) used to tint Obsy cards. */
          topicHue: number;
          /** Initial mode. */
          mode: 'view' | 'edit';
      }
    | { type: 'setMode'; mode: 'view' | 'edit' }
    | {
          type: 'addShape';
          shape:
              | { kind: 'note'; text: string }
              | {
                    kind: 'image';
                    /** Embedded image as a `data:image/...;base64,…` URL. */
                    dataUrl: string;
                    width: number;
                    height: number;
                }
              | {
                    kind: 'obsyCard';
                    variant: 'entry' | 'insight' | 'gap' | 'link' | 'note';
                    title: string;
                    body: string;
                    url?: string;
                    refId?: string;
                };
      }
    /** Reply to a prior `requestAsset` — a freshly-signed URL for the storage path. */
    | { type: 'resolveAsset'; storagePath: string; url: string | null }
    /** Ask the board to immediately emit its current snapshot (before unmount). */
    | { type: 'flush' };

/** Messages sent from the WebView OUT to React Native. */
export type BoardToRnMessage =
    | { type: 'ready' }
    | { type: 'snapshot'; snapshot: unknown; isEmpty: boolean }
    /** The canvas needs a signed URL for an image stored at storagePath. */
    | { type: 'requestAsset'; storagePath: string }
    /** Finger down/up on the canvas — lets RN disable page-swipe while drawing. */
    | { type: 'interaction'; phase: 'start' | 'end' }
    /** View-mode tap on an Obsy card — open the native viewer for that item. */
    | { type: 'openItem'; refId: string };

export function postToRn(msg: BoardToRnMessage) {
    const w = window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } };
    w.ReactNativeWebView?.postMessage(JSON.stringify(msg));
}

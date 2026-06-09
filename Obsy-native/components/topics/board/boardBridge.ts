// ── Obsy Board WebView bridge protocol (RN side) ────────────────────────────
// Mirror of board-web/src/bridge.ts. Keep the two in sync.

/** Messages sent from React Native INTO the WebView. */
export type RnToBoardMessage =
    | {
          type: 'init';
          snapshot: unknown | null;
          topicHue: number;
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
    | { type: 'resolveAsset'; storagePath: string; url: string | null }
    | { type: 'flush' };

/** Messages sent from the WebView OUT to React Native. */
export type BoardToRnMessage =
    | { type: 'ready' }
    | { type: 'snapshot'; snapshot: unknown; isEmpty: boolean }
    | { type: 'requestAsset'; storagePath: string }
    | { type: 'interaction'; phase: 'start' | 'end' }
    | { type: 'openItem'; refId: string }
    /** Forwarded console output / errors from inside the WebView (debug aid). */
    | { type: 'console'; level: string; text: string };

/**
 * Build a JS string that delivers a message to the board bundle via
 * `window.obsyBoard.receive`. Double-stringified so the inner payload is a safe
 * JS string literal. Append `true;` so injectJavaScript doesn't warn.
 */
export function buildInject(msg: RnToBoardMessage): string {
    const payload = JSON.stringify(JSON.stringify(msg));
    return `window.obsyBoard && window.obsyBoard.receive(${payload}); true;`;
}

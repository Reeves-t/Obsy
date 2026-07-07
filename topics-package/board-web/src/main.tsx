import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
    Tldraw,
    Editor,
    TLAssetStore,
    AssetRecordType,
    getSnapshot,
    loadSnapshot,
    toRichText,
} from 'tldraw';
import 'tldraw/tldraw.css';
import { ObsyCardShapeUtil } from './ObsyCardShapeUtil';
import { postToRn, type RnToBoardMessage } from './bridge';

let editor: Editor | null = null;
let topicHue = 250;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// Pending image-asset resolutions keyed by storage path. The asset store posts a
// `requestAsset` to RN and parks the promise resolver here; RN answers with
// `resolveAsset`.
const assetResolvers = new Map<string, (url: string | null) => void>();

// Read a File into a downscaled JPEG data URL so it can be embedded directly in
// the board (no upload server). Used by tldraw's built-in image flows (toolbar
// media tool, drag-drop, paste).
async function fileToDataUrl(file: File, maxDim = 768, quality = 0.5): Promise<string> {
    if (file.type.startsWith('image/')) {
        try {
            const bitmap = await createImageBitmap(file);
            const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
            const w = Math.max(1, Math.round(bitmap.width * scale));
            const h = Math.max(1, Math.round(bitmap.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(bitmap, 0, 0, w, h);
                bitmap.close?.();
                return canvas.toDataURL('image/jpeg', quality);
            }
        } catch {
            /* fall through to raw read */
        }
    }
    return new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
    });
}

// ── Asset store: embed uploads as data URLs; resolve `obsy://` (legacy) srcs ──
const assets: TLAssetStore = {
    async upload(_asset, file) {
        return { src: await fileToDataUrl(file) };
    },
    async resolve(asset) {
        const src = asset.props.src ?? '';
        if (!src.startsWith('obsy://')) return src;
        const storagePath = src.slice('obsy://'.length);
        return new Promise<string | null>((res) => {
            assetResolvers.set(storagePath, res);
            postToRn({ type: 'requestAsset', storagePath });
        });
    },
};

// ── Persistence ──────────────────────────────────────────────────────────────
function emitSnapshot() {
    if (!editor) return;
    const snapshot = getSnapshot(editor.store);
    const isEmpty = editor.getCurrentPageShapeIds().size === 0;
    postToRn({ type: 'snapshot', snapshot, isEmpty });
}

function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(emitSnapshot, 1500);
}

// ── Shape creation helpers ───────────────────────────────────────────────────
function viewportCenter() {
    return editor!.getViewportPageBounds().center;
}

function addNote(text: string) {
    const c = viewportCenter();
    editor!.createShape({
        type: 'note',
        x: c.x - 100,
        y: c.y - 100,
        props: { richText: toRichText(text || '') },
    });
}

function addImage(p: { dataUrl: string; width: number; height: number }) {
    // Fit large images into a reasonable on-canvas size.
    const maxDim = 320;
    const scale = Math.min(1, maxDim / Math.max(p.width, p.height || 1));
    const w = Math.round((p.width || maxDim) * scale);
    const h = Math.round((p.height || maxDim) * scale);

    // The image data is embedded directly (data URL), so no asset resolution is
    // needed — it renders immediately and survives reload.
    const asset = AssetRecordType.create({
        id: AssetRecordType.createId(),
        type: 'image',
        props: {
            name: 'image',
            src: p.dataUrl,
            w: p.width || maxDim,
            h: p.height || maxDim,
            mimeType: 'image/jpeg',
            isAnimated: false,
        },
        meta: {},
    });
    editor!.createAssets([asset]);

    const c = viewportCenter();
    editor!.createShape({
        type: 'image',
        x: c.x - w / 2,
        y: c.y - h / 2,
        props: { assetId: asset.id, w, h },
    });
}

function addObsyCard(p: {
    variant: string;
    title: string;
    body: string;
    url?: string;
    refId?: string;
}) {
    const c = viewportCenter();
    editor!.createShape({
        type: 'obsyCard',
        x: c.x - 120,
        y: c.y - 84,
        props: {
            variant: p.variant,
            title: p.title,
            body: p.body,
            url: p.url ?? '',
            refId: p.refId ?? '',
            hue: topicHue,
        },
    });
}

function setMode(mode: 'view' | 'edit') {
    if (!editor) return;
    editor.updateInstanceState({ isReadonly: mode === 'view' });
    if (mode === 'view') editor.setCurrentTool('hand');
    else editor.setCurrentTool('select');
}

// ── RN → Board message handling ──────────────────────────────────────────────
function handle(msg: RnToBoardMessage) {
    if (!editor) return;
    switch (msg.type) {
        case 'init': {
            topicHue = msg.topicHue ?? 250;
            if (msg.snapshot) {
                try {
                    loadSnapshot(editor.store, msg.snapshot as Parameters<typeof loadSnapshot>[1]);
                } catch (e) {
                    console.warn('[board] failed to load snapshot', e);
                }
            }
            editor.zoomToFit();
            setMode(msg.mode);
            break;
        }
        case 'setMode':
            setMode(msg.mode);
            break;
        case 'addShape': {
            const s = msg.shape;
            if (s.kind === 'note') addNote(s.text);
            else if (s.kind === 'image') addImage(s);
            else if (s.kind === 'obsyCard') addObsyCard(s);
            scheduleSave();
            break;
        }
        case 'resolveAsset': {
            const r = assetResolvers.get(msg.storagePath);
            if (r) {
                r(msg.url);
                assetResolvers.delete(msg.storagePath);
            }
            break;
        }
        case 'flush':
            if (saveTimer) clearTimeout(saveTimer);
            emitSnapshot();
            break;
    }
}

// Expose the inbound entry point used by RN's injectJavaScript.
(window as unknown as { obsyBoard: { receive: (json: string) => void } }).obsyBoard = {
    receive(json: string) {
        try {
            handle(JSON.parse(json) as RnToBoardMessage);
        } catch (e) {
            console.warn('[board] bad message', e);
        }
    },
};

// Pointer events drive the page-swipe lock on the RN side.
window.addEventListener('pointerdown', () => postToRn({ type: 'interaction', phase: 'start' }), true);
const endInteraction = () => postToRn({ type: 'interaction', phase: 'end' });
window.addEventListener('pointerup', endInteraction, true);
window.addEventListener('pointercancel', endInteraction, true);
window.addEventListener('pagehide', emitSnapshot);

function onMount(e: Editor) {
    editor = e;
    try {
        e.user.updateUserPreferences({ colorScheme: 'dark' });
    } catch {
        /* older tldraw — ignore */
    }
    // Autosave on user-driven document changes.
    e.store.listen(scheduleSave, { scope: 'document', source: 'user' });
    postToRn({ type: 'ready' });
}

// Hide tldraw's built-in chrome — the board is driven by the app's native chrome
// (Add / Edit toggle / close) plus the long-press context menu. ContextMenu is
// intentionally kept for lock / delete / bring-forward-back.
const hiddenComponents = {
    MenuPanel: null,
    MainMenu: null,
    PageMenu: null,
    NavigationPanel: null,
    ActionsMenu: null,
    QuickActions: null,
    HelpMenu: null,
    ZoomMenu: null,
    Minimap: null,
    DebugMenu: null,
    DebugPanel: null,
    SharePanel: null,
    // Toolbar + StylePanel are intentionally KEPT — they're the editing tools, and
    // tldraw auto-hides them in readonly (View) mode. They only show in Edit mode.
} as const;

function App() {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'transparent' }}>
            <Tldraw
                shapeUtils={[ObsyCardShapeUtil]}
                assets={assets}
                components={hiddenComponents}
                onMount={onMount}
            />
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);

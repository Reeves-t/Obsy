import {
    BaseBoxShapeUtil,
    HTMLContainer,
    RecordProps,
    T,
    TLShape,
} from 'tldraw';

// A custom tldraw shape that renders an Obsy entry / insight / link as a styled
// "blog card" on the board. This is where the artistic, content-rich feel lives
// (vs. plain sticky notes). It's a box shape, so tldraw gives us move + resize
// + lock + z-order for free.

export type ObsyCardVariant = 'entry' | 'insight' | 'gap' | 'link' | 'note';

export interface ObsyCardProps {
    w: number;
    h: number;
    variant: string;
    title: string;
    body: string;
    url: string;
    /** Topic hue 0-360, used for the accent bar/badge. */
    hue: number;
    /** Optional id linking back to the source capture/note (for tap-to-open). */
    refId: string;
}

// Register the custom shape in tldraw's type registry (v5 mechanism) so it
// becomes part of TLShape / TLBaseBoxShape and type-checks throughout.
declare module '@tldraw/tlschema' {
    interface TLGlobalShapePropsMap {
        obsyCard: ObsyCardProps;
    }
}

export type ObsyCardShape = TLShape<'obsyCard'>;

const VARIANT_LABEL: Record<ObsyCardVariant, string> = {
    entry: 'Entry',
    insight: 'Insight',
    gap: 'Gap',
    link: 'Link',
    note: 'Note',
};

export class ObsyCardShapeUtil extends BaseBoxShapeUtil<ObsyCardShape> {
    static override type = 'obsyCard' as const;

    static override props: RecordProps<ObsyCardShape> = {
        w: T.number,
        h: T.number,
        variant: T.string,
        title: T.string,
        body: T.string,
        url: T.string,
        hue: T.number,
        refId: T.string,
    };

    getDefaultProps(): ObsyCardShape['props'] {
        return {
            w: 240,
            h: 168,
            variant: 'note',
            title: '',
            body: '',
            url: '',
            hue: 250,
            refId: '',
        };
    }

    override canEdit() {
        return false;
    }

    component(shape: ObsyCardShape) {
        const { w, h, variant, title, body, url, hue } = shape.props;
        const accent = `hsl(${hue}, 72%, 64%)`;
        const label = VARIANT_LABEL[variant as ObsyCardVariant] ?? 'Note';

        return (
            <HTMLContainer
                style={{
                    width: w,
                    height: h,
                    pointerEvents: 'all',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: 16,
                    boxSizing: 'border-box',
                    borderRadius: 16,
                    background: 'rgba(20, 20, 28, 0.92)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderLeft: `3px solid ${accent}`,
                    color: '#fff',
                    overflow: 'hidden',
                    fontFamily:
                        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
                }}
            >
                <div
                    style={{
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        color: accent,
                    }}
                >
                    {label}
                </div>
                {!!title && (
                    <div
                        style={{
                            fontSize: 15,
                            fontWeight: 600,
                            lineHeight: 1.25,
                            color: '#fff',
                        }}
                    >
                        {title}
                    </div>
                )}
                {!!body && (
                    <div
                        style={{
                            fontSize: 13,
                            lineHeight: 1.45,
                            color: 'rgba(255,255,255,0.72)',
                            overflow: 'hidden',
                            flex: 1,
                        }}
                    >
                        {body}
                    </div>
                )}
                {!!url && (
                    <div
                        style={{
                            fontSize: 11,
                            color: accent,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {url}
                    </div>
                )}
            </HTMLContainer>
        );
    }

    getIndicatorPath(shape: ObsyCardShape) {
        const path = new Path2D();
        path.roundRect(0, 0, shape.props.w, shape.props.h, 16);
        return path;
    }
}

import GObject from 'gi://GObject';
import St from 'gi://St';
import Meta from 'gi://Meta';

// GObject.registerClass erases parent class methods on `this`.
// Cast through the parent type to access inherited methods.
type BinThis = St.Bin & OverlayWidgetPrivate;

interface OverlayWidgetPrivate {
    _applyStyle(hex: string, opacity: number): void;
}

export const OverlayWidget = GObject.registerClass(
    {
        GTypeName: 'KodecanterOverlayWidget',
    },
    class OverlayWidget extends St.Bin {
        constructor(params: {
            color: string;
            opacity: number; // 0-100
        }) {
            super({
                reactive: false,
                can_focus: false,
                track_hover: false,
            });
            (this as BinThis)._applyStyle(params.color, params.opacity);
        }

        setColor(hex: string, opacity: number): void {
            (this as BinThis)._applyStyle(hex, opacity);
        }

        sizeToWindow(metaWindow: Meta.Window): void {
            const rect = metaWindow.get_frame_rect();
            (this as BinThis).set_position(0, 0);
            (this as BinThis).set_size(rect.width, rect.height);
        }

        _applyStyle(hex: string, opacity: number): void {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            const alpha = opacity / 100;
            (this as BinThis).set_style(
                `background-color: rgba(${r}, ${g}, ${b}, ${alpha});`,
            );
        }
    },
);

export type OverlayWidget = InstanceType<typeof OverlayWidget>;

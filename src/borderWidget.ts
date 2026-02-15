import GObject from 'gi://GObject';
import St from 'gi://St';
import Meta from 'gi://Meta';

// GObject.registerClass erases parent class methods on `this`.
// Cast through the parent type to access inherited methods.
type BinThis = St.Bin & BorderWidgetPrivate;

interface BorderWidgetPrivate {
    _applyStyle(hex: string, width: number, radius: number): void;
}

export const BorderWidget = GObject.registerClass(
    {
        GTypeName: 'KodecanterBorderWidget',
    },
    class BorderWidget extends St.Bin {
        constructor(params: {
            color: string;
            width: number;
            radius: number;
        }) {
            super({
                reactive: false,
                can_focus: false,
                track_hover: false,
            });
            (this as BinThis)._applyStyle(params.color, params.width, params.radius);
        }

        setColor(hex: string, width: number, radius: number): void {
            (this as BinThis)._applyStyle(hex, width, radius);
        }

        sizeToWindow(metaWindow: Meta.Window): void {
            const rect = metaWindow.get_frame_rect();
            (this as BinThis).set_position(0, 0);
            (this as BinThis).set_size(rect.width, rect.height);
        }

        _applyStyle(hex: string, width: number, radius: number): void {
            (this as BinThis).set_style(
                `border: ${width}px solid ${hex}; ` +
                `border-radius: ${radius}px; ` +
                `background-color: transparent;`,
            );
        }
    },
);

export type BorderWidget = InstanceType<typeof BorderWidget>;

import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';

// Simple color overlay using ShaderEffect.
// Blends a semi-transparent color over the entire window.
const OVERLAY_SHADER = `
uniform vec4 overlay_color;

void main() {
    vec4 texColor = texture2D(cogl_sampler_in[0], cogl_tex_coord_in[0].xy);
    cogl_color_out = mix(texColor, overlay_color, overlay_color.a);
}
`;

type ShaderEffectThis = Clutter.ShaderEffect & OverlayEffectPrivate;

interface OverlayEffectPrivate {
    _overlayColor: [number, number, number, number];
    _updateUniforms(): void;
}

export const OverlayEffect = GObject.registerClass(
    {
        GTypeName: 'KodecanterOverlayEffect',
    },
    class OverlayEffect extends Clutter.ShaderEffect {
        _overlayColor!: [number, number, number, number];

        constructor(params: {
            color: [number, number, number, number];
            opacity: number; // 0-100
        }) {
            super({ shader_type: Clutter.ShaderType.FRAGMENT_SHADER });

            this._overlayColor = [
                params.color[0],
                params.color[1],
                params.color[2],
                params.opacity / 100,
            ];

            (this as ShaderEffectThis).set_shader_source(OVERLAY_SHADER);
        }

        setColor(rgba: [number, number, number, number], opacity: number): void {
            this._overlayColor = [rgba[0], rgba[1], rgba[2], opacity / 100];
            (this as ShaderEffectThis)._updateUniforms();
        }

        vfunc_paint_target(node: Clutter.PaintNode, paintContext: Clutter.PaintContext): void {
            (this as ShaderEffectThis)._updateUniforms();
            super.vfunc_paint_target(node, paintContext);
        }

        _updateUniforms(): void {
            const self = this as ShaderEffectThis;
            self.set_uniform_value('overlay_color', self._overlayColor);
            self.queue_repaint();
        }
    },
);

export type OverlayEffect = InstanceType<typeof OverlayEffect>;

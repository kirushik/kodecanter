import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';

// GLSL fragment shader: SDF rounded-rectangle border.
// Draws a border of `border_width` pixels with `border_radius` rounded corners
// in `border_color` around the actor. Interior is transparent (pass-through).
const BORDER_SHADER = `
uniform vec4 border_color;
uniform float border_width;
uniform float border_radius;
uniform vec2 size;

// Signed distance from point p to a rounded rectangle centered at origin
// with half-dimensions b and corner radius r.
float roundedRectSDF(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + vec2(r);
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main() {
    vec2 halfSize = size * 0.5;
    vec2 p = cogl_tex_coord_in[0].xy * size - halfSize;

    // Distance to outer edge
    float distOuter = roundedRectSDF(p, halfSize, border_radius);
    // Distance to inner edge
    float distInner = roundedRectSDF(p, halfSize - vec2(border_width), max(border_radius - border_width, 0.0));

    // Anti-aliased border: outer edge fades in, inner edge fades out
    float outerAlpha = 1.0 - smoothstep(-1.0, 0.5, distOuter);
    float innerAlpha = smoothstep(-0.5, 1.0, distInner);

    float borderAlpha = outerAlpha * innerAlpha;

    // Fetch the original texture from the offscreen buffer
    vec4 texColor = texture2D(cogl_sampler_in[0], cogl_tex_coord_in[0].xy);

    // Composite: original texture + border overlay
    cogl_color_out = mix(texColor, border_color, borderAlpha * border_color.a);
}
`;

// GObject.registerClass erases parent class method types on `this`.
// Cast through the parent type to access inherited methods.
type ShaderEffectThis = Clutter.ShaderEffect & BorderEffectPrivate;

interface BorderEffectPrivate {
    _borderColor: [number, number, number, number];
    _borderWidth: number;
    _borderRadius: number;
    _updateUniforms(): void;
}

export const BorderEffect = GObject.registerClass(
    {
        GTypeName: 'KodecanterBorderEffect',
    },
    class BorderEffect extends Clutter.ShaderEffect {
        _borderColor!: [number, number, number, number];
        _borderWidth!: number;
        _borderRadius!: number;

        constructor(params: {
            color: [number, number, number, number];
            width: number;
            radius: number;
        }) {
            super({ shader_type: Clutter.ShaderType.FRAGMENT_SHADER });

            this._borderColor = params.color;
            this._borderWidth = params.width;
            this._borderRadius = params.radius;

            (this as ShaderEffectThis).set_shader_source(BORDER_SHADER);
        }

        setColor(rgba: [number, number, number, number]): void {
            this._borderColor = rgba;
            (this as ShaderEffectThis)._updateUniforms();
        }

        setBorderWidth(width: number): void {
            this._borderWidth = width;
            (this as ShaderEffectThis)._updateUniforms();
        }

        setBorderRadius(radius: number): void {
            this._borderRadius = radius;
            (this as ShaderEffectThis)._updateUniforms();
        }

        vfunc_paint_target(node: Clutter.PaintNode, paintContext: Clutter.PaintContext): void {
            (this as ShaderEffectThis)._updateUniforms();
            super.vfunc_paint_target(node, paintContext);
        }

        _updateUniforms(): void {
            const self = this as ShaderEffectThis;
            const actor = self.get_actor();
            if (!actor) return;

            const [w, h] = actor.get_size();

            self.set_uniform_value('size', [w, h]);
            self.set_uniform_value('border_color', self._borderColor);
            self.set_uniform_value('border_width', self._borderWidth);
            self.set_uniform_value('border_radius', self._borderRadius);
            self.queue_repaint();
        }
    },
);

export type BorderEffect = InstanceType<typeof BorderEffect>;

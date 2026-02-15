import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';

import { LOG_PREFIX, SCALE_THRESHOLD, THUMBNAIL_BORDER_PX } from './constants.js';

const DEBUG_FRAME_EFFECT = true;
let debugPaintCount = 0;

// GObject.registerClass erases parent class methods on `this`.
// Cast through the union type to access inherited + private members.
type EffectThis = Clutter.Effect & ScaleAwareFrameEffectPrivate;

interface ScaleAwareFrameEffectPrivate {
    _color: Cogl.Color;
}

export const ScaleAwareFrameEffect = GObject.registerClass(
    {
        GTypeName: 'KodecanterScaleAwareFrameEffect',
    },
    class ScaleAwareFrameEffect extends Clutter.Effect {
        _color: Cogl.Color;

        constructor(params: { colorHex: string }) {
            super();
            const [ok, color] = Cogl.Color.from_string(params.colorHex);
            (this as EffectThis)._color = ok ? color : new Cogl.Color({ red: 1, green: 1, blue: 1, alpha: 1 });
        }

        setColor(hex: string): void {
            const [ok, color] = Cogl.Color.from_string(hex);
            if (ok) (this as EffectThis)._color = color;
        }

        vfunc_paint(node: Clutter.PaintNode, paintContext: Clutter.PaintContext, _flags: Clutter.EffectPaintFlags): void {
            const actor = (this as EffectThis).get_actor();
            if (!actor) return;

            // Always paint the actor content first
            actor.continue_paint(paintContext);

            // Only draw frame during clone paints (thumbnails, dock previews, etc.)
            // Normal window paints and the main overview (Super key) are not affected.
            if (!actor.is_in_clone_paint()) return;

            const alloc = actor.get_allocation_box();
            const actorW = alloc.get_width();
            const actorH = alloc.get_height();
            if (actorW <= 0 || actorH <= 0) return;

            // Compute paint scale from modelview matrix elements.
            // In clone context, the clone pushes its scale via cogl_framebuffer_scale(),
            // so the modelview matrix reflects the clone's actual scale.
            const fb = paintContext.get_framebuffer();
            const m = fb.get_modelview_matrix();
            const m00 = m.get_value(0, 0);
            const m10 = m.get_value(1, 0);
            const paintScale = Math.sqrt(m00 * m00 + m10 * m10);

            // Normalize by display scale for HiDPI
            const displayScale = actor.get_resource_scale();
            const relativeScale = paintScale / Math.max(displayScale, 1);

            if (DEBUG_FRAME_EFFECT && debugPaintCount < 30) {
                debugPaintCount++;
                console.log(`${LOG_PREFIX} FrameEffect: clone=true paintScale=${paintScale.toFixed(3)} displayScale=${displayScale} relativeScale=${relativeScale.toFixed(3)} actor=${actorW}x${actorH}`);
            }

            // Only draw at small scales — skip large clones like the Window Overview
            if (relativeScale >= SCALE_THRESHOLD) return;

            // Scale-compensated border with safety clamps
            const safeScale = Math.max(relativeScale, 0.02);
            const borderW = Math.min(
                THUMBNAIL_BORDER_PX / safeScale,
                Math.min(actorW, actorH) * 0.12,
            );

            if (borderW < 1) return;

            const colorNode = Clutter.ColorNode.new((this as EffectThis)._color);

            // Top
            colorNode.add_rectangle(new Clutter.ActorBox({ x1: 0, y1: 0, x2: actorW, y2: borderW }));
            // Bottom
            colorNode.add_rectangle(new Clutter.ActorBox({ x1: 0, y1: actorH - borderW, x2: actorW, y2: actorH }));
            // Left
            colorNode.add_rectangle(new Clutter.ActorBox({ x1: 0, y1: borderW, x2: borderW, y2: actorH - borderW }));
            // Right
            colorNode.add_rectangle(new Clutter.ActorBox({ x1: actorW - borderW, y1: borderW, x2: actorW, y2: actorH - borderW }));

            node.add_child(colorNode);
        }
    },
);

export type ScaleAwareFrameEffect = InstanceType<typeof ScaleAwareFrameEffect>;

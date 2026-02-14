import Meta from 'gi://Meta';
import St from 'gi://St';
import Gio from 'gi://Gio';

import { BorderEffect } from './borderEffect.js';
import { OverlayEffect } from './overlayEffect.js';
import { getColorForProject, type ProjectColor } from './colorResolver.js';
import {
    EFFECT_NAME,
    OVERLAY_EFFECT_NAME,
    BADGE_STYLE_CLASS,
    LOG_PREFIX,
    DEFAULT_BORDER_WIDTH,
    DEFAULT_BORDER_RADIUS,
    DEFAULT_OVERLAY_OPACITY,
} from './constants.js';

interface WindowDecoration {
    border: BorderEffect | null;
    overlay: OverlayEffect | null;
    badge: St.Label | null;
    color: ProjectColor;
    projectName: string;
}

export class DecorationManager {
    private _settings: Gio.Settings;
    private _decorated = new Map<Meta.Window, WindowDecoration>();
    private _settingsSignals: number[] = [];

    constructor(settings: Gio.Settings) {
        this._settings = settings;

        this._settingsSignals.push(
            settings.connect('changed', () => this._onSettingsChanged()),
        );
    }

    decorateWindow(metaWindow: Meta.Window, projectName: string): void {
        this.removeDecorations(metaWindow);

        const overrides = this._readOverrides();
        const color = getColorForProject(projectName, overrides);
        const actor = metaWindow.get_compositor_private();
        if (!actor) return;

        const decoration: WindowDecoration = {
            border: null,
            overlay: null,
            badge: null,
            color,
            projectName,
        };

        if (this._settings.get_boolean('border-enabled')) {
            const border = new BorderEffect({
                color: color.rgba,
                width: this._settings.get_int('border-width'),
                radius: this._settings.get_int('border-radius'),
            });
            actor.add_effect_with_name(EFFECT_NAME, border);
            decoration.border = border;
        }

        if (this._settings.get_boolean('overlay-enabled')) {
            const overlay = new OverlayEffect({
                color: color.rgba,
                opacity: this._settings.get_int('overlay-opacity'),
            });
            actor.add_effect_with_name(OVERLAY_EFFECT_NAME, overlay);
            decoration.overlay = overlay;
        }

        if (this._settings.get_boolean('badge-enabled')) {
            const badge = new St.Label({
                text: projectName,
                style_class: BADGE_STYLE_CLASS,
                style: `background-color: ${color.hex};`,
                reactive: false,
            });
            actor.add_child(badge);
            decoration.badge = badge;
            this._positionBadge(metaWindow, badge);
        }

        this._decorated.set(metaWindow, decoration);
    }

    updateWindow(metaWindow: Meta.Window, projectName: string): void {
        const decoration = this._decorated.get(metaWindow);
        if (!decoration) {
            this.decorateWindow(metaWindow, projectName);
            return;
        }

        const overrides = this._readOverrides();
        const color = getColorForProject(projectName, overrides);
        decoration.color = color;
        decoration.projectName = projectName;

        if (decoration.border) {
            decoration.border.setColor(color.rgba);
        }

        if (decoration.overlay) {
            decoration.overlay.setColor(
                color.rgba,
                this._settings.get_int('overlay-opacity'),
            );
        }

        if (decoration.badge) {
            decoration.badge.set_text(projectName);
            decoration.badge.set_style(`background-color: ${color.hex};`);
        }
    }

    repositionBadge(metaWindow: Meta.Window): void {
        const decoration = this._decorated.get(metaWindow);
        if (decoration?.badge) {
            this._positionBadge(metaWindow, decoration.badge);
        }
    }

    setFullscreen(metaWindow: Meta.Window, isFullscreen: boolean): void {
        const decoration = this._decorated.get(metaWindow);
        if (!decoration) return;

        const actor = metaWindow.get_compositor_private();
        if (!actor) return;

        if (isFullscreen) {
            if (decoration.border)
                actor.remove_effect_by_name(EFFECT_NAME);
            if (decoration.overlay)
                actor.remove_effect_by_name(OVERLAY_EFFECT_NAME);
            if (decoration.badge)
                decoration.badge.hide();
        } else {
            if (decoration.border)
                actor.add_effect_with_name(EFFECT_NAME, decoration.border);
            if (decoration.overlay)
                actor.add_effect_with_name(OVERLAY_EFFECT_NAME, decoration.overlay);
            if (decoration.badge)
                decoration.badge.show();
        }
    }

    removeDecorations(metaWindow: Meta.Window): void {
        const decoration = this._decorated.get(metaWindow);
        if (!decoration) return;

        const actor = metaWindow.get_compositor_private();
        if (actor) {
            actor.remove_effect_by_name(EFFECT_NAME);
            actor.remove_effect_by_name(OVERLAY_EFFECT_NAME);
        }

        if (decoration.badge) {
            decoration.badge.destroy();
        }

        this._decorated.delete(metaWindow);
    }

    destroy(): void {
        for (const metaWindow of [...this._decorated.keys()]) {
            this.removeDecorations(metaWindow);
        }

        for (const id of this._settingsSignals) {
            this._settings.disconnect(id);
        }
        this._settingsSignals = [];

        console.log(`${LOG_PREFIX} DecorationManager destroyed`);
    }

    private _positionBadge(metaWindow: Meta.Window, badge: St.Label): void {
        const rect = metaWindow.get_frame_rect();
        badge.set_position(rect.width - badge.width - 8, 8);
    }

    private _readOverrides(): Map<string, string> {
        const variant = this._settings.get_value('color-overrides');
        const unpacked = variant.deep_unpack() as Record<string, string>;
        return new Map(Object.entries(unpacked));
    }

    private _onSettingsChanged(): void {
        // Re-apply decorations to all tracked windows
        for (const [metaWindow, decoration] of this._decorated) {
            this.decorateWindow(metaWindow, decoration.projectName);
        }
    }
}

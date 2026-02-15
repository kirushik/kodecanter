import Meta from 'gi://Meta';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { BorderWidget } from './borderWidget.js';
import { OverlayWidget } from './overlayWidget.js';
import { ScaleAwareFrameEffect } from './scaleAwareFrameEffect.js';
import { getColorForProject, type ProjectColor } from './colorResolver.js';
import {
    BADGE_STYLE_CLASS,
    LOG_PREFIX,
} from './constants.js';

interface WindowDecoration {
    border: BorderWidget | null;
    overlay: OverlayWidget | null;
    badge: St.Label | null;
    frameEffect: ScaleAwareFrameEffect | null;
    color: ProjectColor;
    projectName: string;
}

export class DecorationManager {
    private _settings: Gio.Settings;
    private _decorated = new Map<Meta.Window, WindowDecoration>();
    private _settingsSignals: number[] = [];
    private _pendingSources = new Set<number>();

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
        if (!actor) {
            this._retryDecorate(metaWindow, projectName);
            return;
        }

        const decoration: WindowDecoration = {
            border: null,
            overlay: null,
            badge: null,
            frameEffect: null,
            color,
            projectName,
        };

        if (this._settings.get_boolean('border-enabled')) {
            const border = new BorderWidget({
                color: color.hex,
                width: this._settings.get_int('border-width'),
                radius: this._settings.get_int('border-radius'),
            });
            actor.add_child(border);
            border.sizeToWindow(metaWindow);
            decoration.border = border;
        }

        if (this._settings.get_boolean('overlay-enabled')) {
            const overlay = new OverlayWidget({
                color: color.hex,
                opacity: this._settings.get_int('overlay-opacity'),
            });
            actor.add_child(overlay);
            overlay.sizeToWindow(metaWindow);
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

        const frameEffect = new ScaleAwareFrameEffect({ colorHex: color.hex });
        actor.add_effect_with_name('kodecanter-frame', frameEffect);
        decoration.frameEffect = frameEffect;

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
            decoration.border.setColor(
                color.hex,
                this._settings.get_int('border-width'),
                this._settings.get_int('border-radius'),
            );
        }

        if (decoration.overlay) {
            decoration.overlay.setColor(
                color.hex,
                this._settings.get_int('overlay-opacity'),
            );
        }

        if (decoration.badge) {
            decoration.badge.set_text(projectName);
            decoration.badge.set_style(`background-color: ${color.hex};`);
            this._positionBadge(metaWindow, decoration.badge);
        }

        if (decoration.frameEffect) {
            decoration.frameEffect.setColor(color.hex);
        }
    }

    repositionDecorations(metaWindow: Meta.Window): void {
        const decoration = this._decorated.get(metaWindow);
        if (!decoration) return;

        if (decoration.border) decoration.border.sizeToWindow(metaWindow);
        if (decoration.overlay) decoration.overlay.sizeToWindow(metaWindow);
        if (decoration.badge) this._positionBadge(metaWindow, decoration.badge);
    }

    setFullscreen(metaWindow: Meta.Window, isFullscreen: boolean): void {
        const decoration = this._decorated.get(metaWindow);
        if (!decoration) return;

        if (isFullscreen) {
            if (decoration.border) decoration.border.hide();
            if (decoration.overlay) decoration.overlay.hide();
            if (decoration.badge) decoration.badge.hide();
            if (decoration.frameEffect) decoration.frameEffect.set_enabled(false);
        } else {
            if (decoration.border) decoration.border.show();
            if (decoration.overlay) decoration.overlay.show();
            if (decoration.badge) decoration.badge.show();
            if (decoration.frameEffect) decoration.frameEffect.set_enabled(true);
        }
    }

    removeDecorations(metaWindow: Meta.Window): void {
        const decoration = this._decorated.get(metaWindow);
        if (!decoration) return;

        if (decoration.border) decoration.border.destroy();
        if (decoration.overlay) decoration.overlay.destroy();
        if (decoration.badge) decoration.badge.destroy();
        if (decoration.frameEffect) {
            const actor = metaWindow.get_compositor_private();
            if (actor) actor.remove_effect(decoration.frameEffect);
        }

        this._decorated.delete(metaWindow);
    }

    destroy(): void {
        for (const metaWindow of [...this._decorated.keys()]) {
            this.removeDecorations(metaWindow);
        }

        for (const id of this._pendingSources) {
            GLib.source_remove(id);
        }
        this._pendingSources.clear();

        for (const id of this._settingsSignals) {
            this._settings.disconnect(id);
        }
        this._settingsSignals = [];

        console.log(`${LOG_PREFIX} DecorationManager destroyed`);
    }

    private _positionBadge(metaWindow: Meta.Window, badge: St.Label): void {
        if (badge.width > 0) {
            this._positionBadgeImmediate(metaWindow, badge);
            return;
        }

        const sourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._pendingSources.delete(sourceId);
            if (badge.get_parent() && this._decorated.has(metaWindow)) {
                this._positionBadgeImmediate(metaWindow, badge);
            }
            return GLib.SOURCE_REMOVE;
        });
        this._pendingSources.add(sourceId);
    }

    private _positionBadgeImmediate(metaWindow: Meta.Window, badge: St.Label): void {
        const frame = metaWindow.get_frame_rect();
        const buffer = metaWindow.get_buffer_rect();
        const dx = frame.x - buffer.x;
        const dy = frame.y - buffer.y;
        badge.set_position(
            dx + Math.round((frame.width - badge.width) / 2),
            dy + 8,
        );
    }

    private _retryDecorate(metaWindow: Meta.Window, projectName: string, attempt = 0): void {
        const MAX_RETRIES = 3;
        if (attempt >= MAX_RETRIES) {
            console.log(`${LOG_PREFIX} Giving up on compositor private for ${projectName} after ${MAX_RETRIES} attempts`);
            return;
        }

        const sourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._pendingSources.delete(sourceId);
            if (metaWindow.get_compositor_private()) {
                this.decorateWindow(metaWindow, projectName);
            } else {
                this._retryDecorate(metaWindow, projectName, attempt + 1);
            }
            return GLib.SOURCE_REMOVE;
        });
        this._pendingSources.add(sourceId);
    }

    private _readOverrides(): Map<string, string> {
        const variant = this._settings.get_value('color-overrides');
        const unpacked = variant.deep_unpack() as Record<string, string>;
        return new Map(Object.entries(unpacked));
    }

    private _onSettingsChanged(): void {
        const entries = [...this._decorated.entries()];
        for (const [metaWindow, decoration] of entries) {
            this.decorateWindow(metaWindow, decoration.projectName);
        }
    }
}

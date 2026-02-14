// Title parsing is pure logic (exported for testing).
// Window tracking uses GNOME Shell APIs.

import { EM_DASH, ZED_WM_CLASSES, SKIP_TITLES, LOG_PREFIX } from './constants.js';

import Meta from 'gi://Meta';
import GLib from 'gi://GLib';

// ── Pure logic (testable in Node.js) ────────────────────────────

export function parseZedTitle(title: string | null): string | null {
    if (!title) return null;

    if (SKIP_TITLES.some(p => title === p || title.startsWith(p + ' ')))
        return null;

    const parts = title.split(` ${EM_DASH} `);
    return parts.length >= 2 ? parts[parts.length - 1].trim() : title.trim();
}

// ── GNOME Shell window tracking ─────────────────────────────────

export interface WindowTrackerCallbacks {
    onWindowTracked(metaWindow: Meta.Window, projectName: string): void;
    onWindowUpdated(metaWindow: Meta.Window, projectName: string): void;
    onWindowLost(metaWindow: Meta.Window): void;
    onWindowFullscreen(metaWindow: Meta.Window, isFullscreen: boolean): void;
    onWindowSizeChanged(metaWindow: Meta.Window): void;
}

interface TrackedWindow {
    projectName: string;
}

export class WindowTracker {
    private _callbacks: WindowTrackerCallbacks;
    private _tracked = new Map<Meta.Window, TrackedWindow>();
    private _displaySignals: number[] = [];

    constructor(callbacks: WindowTrackerCallbacks) {
        this._callbacks = callbacks;
    }

    enable(display: Meta.Display): void {
        this._displaySignals.push(
            display.connect('window-created', (_display: Meta.Display, metaWindow: Meta.Window) => {
                this._onWindowCreated(metaWindow);
            }),
        );

        // Process windows that already exist
        for (const actor of global.compositor.get_window_actors()) {
            const metaWindow = actor.get_meta_window();
            if (metaWindow) this._onWindowCreated(metaWindow);
        }

        console.log(`${LOG_PREFIX} WindowTracker enabled`);
    }

    disable(): void {
        const display = global.display;
        for (const id of this._displaySignals) {
            display.disconnect(id);
        }
        this._displaySignals = [];

        for (const metaWindow of this._tracked.keys()) {
            this._callbacks.onWindowLost(metaWindow);
        }
        this._tracked.clear();

        console.log(`${LOG_PREFIX} WindowTracker disabled`);
    }

    private _isZedWindow(metaWindow: Meta.Window): boolean {
        const wmClass = metaWindow.get_wm_class();
        if (!wmClass) return false;
        return ZED_WM_CLASSES.includes(wmClass);
    }

    private _onWindowCreated(metaWindow: Meta.Window): void {
        // WM_CLASS may not be set yet; defer check
        if (this._isZedWindow(metaWindow)) {
            this._tryTrack(metaWindow);
            return;
        }

        // WM_CLASS might arrive late — watch for it briefly
        const sourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            if (this._isZedWindow(metaWindow) && !this._tracked.has(metaWindow)) {
                this._tryTrack(metaWindow);
            }
            return GLib.SOURCE_REMOVE;
        });

        // Ensure the timeout source doesn't leak if window is destroyed first
        metaWindow.connect('unmanaging', () => {
            GLib.source_remove(sourceId);
        });
    }

    private _tryTrack(metaWindow: Meta.Window): void {
        const projectName = parseZedTitle(metaWindow.get_title());

        if (!projectName) {
            // Title not ready — wait for it
            const titleSignal = metaWindow.connect('notify::title', () => {
                const name = parseZedTitle(metaWindow.get_title());
                if (name) {
                    metaWindow.disconnect(titleSignal);
                    this._trackWindow(metaWindow, name);
                }
            });

            metaWindow.connect('unmanaging', () => {
                metaWindow.disconnect(titleSignal);
            });
            return;
        }

        this._trackWindow(metaWindow, projectName);
    }

    private _trackWindow(metaWindow: Meta.Window, projectName: string): void {
        if (this._tracked.has(metaWindow)) return;

        this._tracked.set(metaWindow, { projectName });
        this._callbacks.onWindowTracked(metaWindow, projectName);

        metaWindow.connect('notify::title', () => {
            const newName = parseZedTitle(metaWindow.get_title());
            const tracked = this._tracked.get(metaWindow);
            if (!tracked || !newName) return;

            if (newName !== tracked.projectName) {
                tracked.projectName = newName;
                this._callbacks.onWindowUpdated(metaWindow, newName);
            }
        });

        metaWindow.connect('size-changed', () => {
            this._callbacks.onWindowSizeChanged(metaWindow);
        });

        metaWindow.connect('notify::fullscreen', () => {
            this._callbacks.onWindowFullscreen(metaWindow, metaWindow.is_fullscreen());
        });

        metaWindow.connect('unmanaging', () => {
            this._callbacks.onWindowLost(metaWindow);
            this._tracked.delete(metaWindow);
        });

        console.log(`${LOG_PREFIX} Tracking: ${projectName}`);
    }
}

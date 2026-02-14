import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import Meta from 'gi://Meta';

import { WindowTracker } from './windowTracker.js';
import { DecorationManager } from './decorationManager.js';
import { LOG_PREFIX } from './constants.js';

export default class KodecanterExtension extends Extension {
    private _windowTracker: WindowTracker | null = null;
    private _decorationManager: DecorationManager | null = null;

    enable(): void {
        const settings = this.getSettings();
        const decorationManager = new DecorationManager(settings);

        const windowTracker = new WindowTracker({
            onWindowTracked(metaWindow: Meta.Window, projectName: string) {
                decorationManager.decorateWindow(metaWindow, projectName);
            },
            onWindowUpdated(metaWindow: Meta.Window, projectName: string) {
                decorationManager.updateWindow(metaWindow, projectName);
            },
            onWindowLost(metaWindow: Meta.Window) {
                decorationManager.removeDecorations(metaWindow);
            },
            onWindowFullscreen(metaWindow: Meta.Window, isFullscreen: boolean) {
                decorationManager.setFullscreen(metaWindow, isFullscreen);
            },
            onWindowSizeChanged(metaWindow: Meta.Window) {
                decorationManager.repositionBadge(metaWindow);
            },
        });

        windowTracker.enable(global.display);

        this._windowTracker = windowTracker;
        this._decorationManager = decorationManager;

        console.log(`${LOG_PREFIX} Extension enabled`);
    }

    disable(): void {
        this._windowTracker?.disable();
        this._decorationManager?.destroy();

        this._windowTracker = null;
        this._decorationManager = null;

        console.log(`${LOG_PREFIX} Extension disabled`);
    }
}

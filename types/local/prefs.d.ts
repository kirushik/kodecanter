// Local type declarations for GNOME Shell extension preferences API.

import type Adw from '@girs/adw-1';
import type Gtk from '@girs/gtk-4.0';

import type { ExtensionBase, TranslationFunctions } from './extension.js';

export class ExtensionPreferences extends ExtensionBase {
    static defineTranslationFunctions(url: string): TranslationFunctions;
    getPreferencesWidget(): Gtk.Widget | Promise<Gtk.Widget>;
    fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void>;
}

export declare const gettext: TranslationFunctions['gettext'];
export declare const ngettext: TranslationFunctions['ngettext'];
export declare const pgettext: TranslationFunctions['pgettext'];

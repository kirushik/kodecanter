// Local type declarations for GNOME Shell extension API.
// Extracted from gjsify/gnome-shell to avoid .ts→.d.ts resolution issues.

import type Gio from '@girs/gio-2.0';

export interface TranslationFunctions {
    gettext(str: string): string;
    ngettext(str: string, strPlural: string, n: number): string;
    pgettext(context: string, str: string): string;
}

export interface MetadataJson extends Record<string, unknown> {
    readonly uuid: string;
    readonly name: string;
    readonly description: string;
    readonly 'shell-version': readonly string[];
}

export class ExtensionBase {
    readonly metadata: MetadataJson;
    static lookupByURL(url: string): Extension | null;
    static lookupByUUID(_uuid: string): Extension | null;
    constructor(metadata: MetadataJson);
    get uuid(): string;
    get dir(): Gio.File;
    get path(): string;
    getSettings(schema?: string): Gio.Settings;
    getLogger(): Console;
    initTranslations(domain?: string): void;
    gettext(str: string): string;
    ngettext(str: string, strPlural: string, n: number): string;
    pgettext(context: string, str: string): string;
}

export class Extension extends ExtensionBase {
    static defineTranslationFunctions(url: string): TranslationFunctions;
    openPreferences(): void;
    enable(): void;
    disable(): void;
}

export class InjectionManager {
    overrideMethod<T, M extends keyof T>(
        prototype: T,
        methodName: M,
        createOverrideFunc: (originalMethod: T[M]) => T[M],
    ): void;
    restoreMethod<T, M extends keyof T>(prototype: T, methodName: M): void;
    clear(): void;
}

export declare const gettext: TranslationFunctions['gettext'];
export declare const ngettext: TranslationFunctions['ngettext'];
export declare const pgettext: TranslationFunctions['pgettext'];

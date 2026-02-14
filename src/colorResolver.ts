// Pure logic — no gi:// imports. Safe to import from Node.js tests.

import {
    DEFAULT_SATURATION,
    DEFAULT_LIGHTNESS,
    GOLDEN_ANGLE,
} from './constants.js';

export function hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++)
        hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xFFFFFFFF;
    return hash >>> 0;
}

export function hueFromProjectName(name: string): number {
    return (hashString(name) * GOLDEN_ANGLE) % 360;
}

export function hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

export function hslToRgba(h: number, s: number, l: number, alpha = 1.0): [number, number, number, number] {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    };
    return [f(0), f(8), f(4), alpha];
}

export function hexToRgba(hex: string): [number, number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b, 1.0];
}

export interface ProjectColor {
    hex: string;
    rgba: [number, number, number, number];
}

export function getColorForProject(
    projectName: string,
    overrides: Map<string, string> | null,
): ProjectColor {
    const override = overrides?.get(projectName);
    if (override) {
        return { hex: override, rgba: hexToRgba(override) };
    }

    const hue = hueFromProjectName(projectName);
    return {
        hex: hslToHex(hue, DEFAULT_SATURATION, DEFAULT_LIGHTNESS),
        rgba: hslToRgba(hue, DEFAULT_SATURATION, DEFAULT_LIGHTNESS),
    };
}

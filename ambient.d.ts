// GJS ambient types
import "@girs/gjs";
import "@girs/gjs/dom";

// gi:// ambient module declarations (from @girs packages)
import "@girs/glib-2.0/glib-2.0-ambient";
import "@girs/gobject-2.0/gobject-2.0-ambient";
import "@girs/gio-2.0/gio-2.0-ambient";
import "@girs/clutter-17/clutter-17-ambient";
import "@girs/cogl-17/cogl-17-ambient";
import "@girs/st-17/st-17-ambient";
import "@girs/meta-17/meta-17-ambient";
import "@girs/mtk-17/mtk-17-ambient";
import "@girs/shell-17/shell-17-ambient";
import "@girs/graphene-1.0/graphene-1.0-ambient";
import "@girs/adw-1/adw-1-ambient";
import "@girs/gtk-4.0/gtk-4.0-ambient";
import "@girs/gdk-4.0/gdk-4.0-ambient";

// GNOME Shell global object + connectObject augmentations:
// included via tsconfig.json "include" from types/gnome-shell/.../global.d.ts

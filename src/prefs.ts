import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import GLib from 'gi://GLib';

import { ExtensionPreferences, gettext as _ } from
    'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class KodecanterPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        const settings = this.getSettings();

        // ── General page ────────────────────────────────
        const generalPage = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(generalPage);

        // Decoration toggles
        const toggleGroup = new Adw.PreferencesGroup({
            title: _('Decoration Types'),
        });
        generalPage.add(toggleGroup);

        for (const [key, label, subtitle] of [
            ['border-enabled', 'Window Borders', 'Colored rounded border around each Zed window'],
            ['overlay-enabled', 'Color Overlay', 'Subtle color tint over the window'],
            ['badge-enabled', 'Project Badge', 'Corner label showing project name'],
        ] as const) {
            const row = new Adw.SwitchRow({
                title: _(label),
                subtitle: _(subtitle),
            });
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            toggleGroup.add(row);
        }

        // Appearance settings
        const appearGroup = new Adw.PreferencesGroup({
            title: _('Appearance'),
        });
        generalPage.add(appearGroup);

        const borderWidthRow = new Adw.SpinRow({
            title: _('Border Width'),
            subtitle: _('Pixels'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 10,
                step_increment: 1,
                value: settings.get_int('border-width'),
            }),
        });
        settings.bind('border-width', borderWidthRow.adjustment, 'value',
            Gio.SettingsBindFlags.DEFAULT);
        appearGroup.add(borderWidthRow);

        const borderRadiusRow = new Adw.SpinRow({
            title: _('Border Radius'),
            subtitle: _('Pixels'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 24,
                step_increment: 1,
                value: settings.get_int('border-radius'),
            }),
        });
        settings.bind('border-radius', borderRadiusRow.adjustment, 'value',
            Gio.SettingsBindFlags.DEFAULT);
        appearGroup.add(borderRadiusRow);

        const overlayOpacityRow = new Adw.SpinRow({
            title: _('Overlay Opacity'),
            subtitle: _('Percent (0 = invisible, 100 = opaque)'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 5,
                value: settings.get_int('overlay-opacity'),
            }),
        });
        settings.bind('overlay-opacity', overlayOpacityRow.adjustment, 'value',
            Gio.SettingsBindFlags.DEFAULT);
        appearGroup.add(overlayOpacityRow);

        // ── Color Overrides page ────────────────────────
        const overridesPage = new Adw.PreferencesPage({
            title: _('Color Overrides'),
            icon_name: 'preferences-color-symbolic',
        });
        window.add(overridesPage);

        const overridesGroup = new Adw.PreferencesGroup({
            title: _('Project Color Overrides'),
            description: _('Override the auto-generated color for specific projects'),
        });
        overridesPage.add(overridesGroup);

        // Load existing overrides
        const loadOverrides = (): Record<string, string> => {
            return settings.get_value('color-overrides').deep_unpack() as Record<string, string>;
        };

        const saveOverrides = (overrides: Record<string, string>): void => {
            settings.set_value('color-overrides',
                new GLib.Variant('a{ss}', overrides));
        };

        const rebuildOverrideRows = (): void => {
            // Remove existing children (dynamic rows)
            let child = overridesGroup.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                if (child instanceof Adw.ActionRow) {
                    overridesGroup.remove(child);
                }
                child = next;
            }

            const overrides = loadOverrides();
            for (const [projectName, hexColor] of Object.entries(overrides)) {
                addOverrideRow(projectName, hexColor);
            }
        };

        const addOverrideRow = (projectName: string, hexColor: string): void => {
            const row = new Adw.ActionRow({ title: projectName });

            const rgba = new Gdk.RGBA();
            rgba.parse(hexColor);

            const colorDialog = new Gtk.ColorDialog();
            const colorButton = new Gtk.ColorDialogButton({
                dialog: colorDialog,
                rgba,
                valign: Gtk.Align.CENTER,
            });

            colorButton.connect('notify::rgba', () => {
                const newColor = colorButton.get_rgba();
                const hex = `#${Math.round(newColor.red * 255).toString(16).padStart(2, '0')}${Math.round(newColor.green * 255).toString(16).padStart(2, '0')}${Math.round(newColor.blue * 255).toString(16).padStart(2, '0')}`;
                const overrides = loadOverrides();
                overrides[projectName] = hex;
                saveOverrides(overrides);
            });

            const deleteButton = new Gtk.Button({
                icon_name: 'edit-delete-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['destructive-action'],
            });

            deleteButton.connect('clicked', () => {
                const overrides = loadOverrides();
                delete overrides[projectName];
                saveOverrides(overrides);
                overridesGroup.remove(row);
            });

            row.add_suffix(colorButton);
            row.add_suffix(deleteButton);
            overridesGroup.add(row);
        };

        // Add-new-override row
        const addGroup = new Adw.PreferencesGroup();
        overridesPage.add(addGroup);

        const addRow = new Adw.EntryRow({
            title: _('Project name'),
        });
        addGroup.add(addRow);

        const addButton = new Gtk.Button({
            label: _('Add Override'),
            css_classes: ['suggested-action'],
            valign: Gtk.Align.CENTER,
        });

        addButton.connect('clicked', () => {
            const name = addRow.get_text().trim();
            if (!name) return;

            const overrides = loadOverrides();
            if (!overrides[name]) {
                overrides[name] = '#3498db';
                saveOverrides(overrides);
                addOverrideRow(name, '#3498db');
            }
            addRow.set_text('');
        });

        addRow.add_suffix(addButton);

        rebuildOverrideRows();

        return Promise.resolve();
    }
}

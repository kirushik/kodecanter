UUID = kodecanter@kirushik.github.io
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: all build install dev pack clean check

all: build

# ── Build ────────────────────────────────────────
build: dist/extension.js schemas/gschemas.compiled
	@cp metadata.json dist/
	@cp stylesheet.css dist/
	@cp -r schemas dist/

dist/extension.js: $(wildcard src/*.ts) tsconfig.json ambient.d.ts
	tsc

schemas/gschemas.compiled: schemas/*.gschema.xml
	glib-compile-schemas schemas

# ── Type checking ────────────────────────────────
check:
	tsc --noEmit

# ── Install to local extensions dir ──────────────
install: build
	@mkdir -p $(INSTALL_DIR)
	@cp -r dist/* $(INSTALL_DIR)/

# ── Launch nested Wayland session for testing ────
dev: install
	dbus-run-session -- env \
		MUTTER_DEBUG_NUM_DUMMY_MONITORS=1 \
		MUTTER_DEBUG_DUMMY_MODE_SPECS=1920x1080 \
		gnome-shell --nested --wayland

# ── Package for distribution ─────────────────────
pack: build
	@(cd dist && zip -qr ../$(UUID).zip *)

# ── Cleanup ──────────────────────────────────────
clean:
	rm -rf dist $(UUID).zip schemas/gschemas.compiled

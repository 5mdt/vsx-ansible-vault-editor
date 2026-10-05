.PHONY: all ddd roadmap release install compile watch lint test test-unit test-integration test-extension screenshots screenshots-publish package publish-vsce publish-ovsx clean

VSIX = build/ansible-vault-editor.vsix
BUMP ?= minor
IMAGES_URL = https://github.com/5mdt/ansible-vault-editor/raw/HEAD/extension

all: lint compile test-unit

ddd:
	./scripts/ddd/ddd check

roadmap:
	./scripts/ddd/ddd roadmap

install:
	npm install

compile:
	npm run compile

watch:
	npm run watch

lint: ddd
	npm run lint

test: test-unit test-integration

test-unit:
	npm run test:unit

test-integration:
	npm run test:integration

test-extension:
	npm run test:extension

screenshots: compile
	npx esbuild scripts/screenshots/run.ts --bundle --platform=node --format=cjs --external:playwright-core --external:@vscode/test-electron --outfile=build/screenshots-run/run.js
	node build/screenshots-run/run.js
	./scripts/screenshots/gif.sh

screenshots-publish:
	mkdir -p extension/media
	cp build/screenshots/demo.gif extension/media/

package: compile
	npx vsce package --no-dependencies --readme-path extension/README.md --baseImagesUrl $(IMAGES_URL) --out $(VSIX)

# Requires a Microsoft Marketplace PAT: VSCE_PAT=... make publish-vsce
publish-vsce: package
	npx vsce publish --no-dependencies --packagePath $(VSIX)

# Requires an Open VSX token: OVSX_PAT=... make publish-ovsx
publish-ovsx: package
	npx ovsx publish $(VSIX)

# Gate, regenerate the demo GIF (SKIP_SCREENSHOTS=1 to skip), bump package.json, move CHANGELOG "Unreleased" into a version section, commit and tag. Nothing is pushed.
release:
	./scripts/release.sh $(BUMP)

clean:
	rm -rf build

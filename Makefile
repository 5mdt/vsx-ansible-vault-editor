.PHONY: all logo site ddd roadmap release install compile watch lint test test-unit test-integration test-extension bench bench-baseline screenshots screenshots-publish package publish-vsce publish-ovsx clean

VSIX = build/ansible-vault-editor.vsix
BUMP ?= minor
IMAGES_URL = https://github.com/5mdt/vsx-ansible-vault-editor/raw/HEAD/extension

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

# Not part of `test` or CI: numbers are machine-specific. Compares with test/bench/baseline.json.
bench:
	mkdir -p build/bench
	npm run bench

# Overwrite the committed baseline from a fresh run.
# The writer emits JS number syntax (0.000048); pretty-format-json wants Python's (4.8e-05), so normalise after.
bench-baseline:
	npm run bench:baseline
	for f in test/bench/baseline/*.json; do python3 -c 'import json,sys; p=sys.argv[1]; d=json.load(open(p)); open(p,"w").write(json.dumps(d,indent=2,ensure_ascii=False)+"\n")' "$$f"; done

screenshots: compile
	npx esbuild scripts/screenshots/run.ts --bundle --platform=node --format=cjs --external:playwright-core --external:@vscode/test-electron --outfile=build/screenshots-run/run.js
	node build/screenshots-run/run.js
	./scripts/screenshots/gif.sh

screenshots-publish:
	mkdir -p extension/media
	cp build/screenshots/demo.gif extension/media/

logo:
	python3 scripts/logo/pxo2png.py extension/logo.pxo build/logo

site:
	rm -rf build/site
	node scripts/site/build.mjs build/site

package: compile
	npx vsce package --no-dependencies --readme-path extension/README.md --baseImagesUrl $(IMAGES_URL) --out $(VSIX)

# Requires a Microsoft Marketplace PAT: VSCE_PAT=... make publish-vsce
publish-vsce: package
	npx vsce publish --no-dependencies --packagePath $(VSIX)

# Requires an Open VSX token: OVSX_PAT=... make publish-ovsx
publish-ovsx: package
	npx ovsx publish $(VSIX)

# Full release: formatters, lint, tests, benchmarks, logo, site, demo GIF, version bump, vsix package, commit and tag. Nothing is pushed.
release:
	./scripts/release.sh $(BUMP)

clean:
	rm -rf build

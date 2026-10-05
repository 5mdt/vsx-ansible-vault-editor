.PHONY: all ddd roadmap install compile watch lint test test-unit test-integration test-extension package publish-vsce publish-ovsx clean

VSIX = build/ansible-vault-editor.vsix

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

package: compile
	npx vsce package --out $(VSIX)

# Requires a Microsoft Marketplace PAT: VSCE_PAT=... make publish-vsce
publish-vsce: package
	npx vsce publish --packagePath $(VSIX)

# Requires an Open VSX token: OVSX_PAT=... make publish-ovsx
publish-ovsx: package
	npx ovsx publish $(VSIX)

clean:
	rm -rf build

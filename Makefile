.PHONY: all ddd install compile watch lint package publish-vsce publish-ovsx clean

VSIX = build/ansible-vault-editor.vsix

all: lint compile

ddd:
	./scripts/ddd/ddd check

install:
	npm install

compile:
	npm run compile

watch:
	npm run watch

lint: ddd
	npm run lint

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

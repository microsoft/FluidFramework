# @fluid-tools/markdown-magic

Shared utilities for Markdown content generation and embedding using markdown-magic. Provides transform pragmas that can be included in Markdown documentation to automatically generate/embed contents.

## Build

- `pnpm build` - Runs markdown-magic on the package's own README.md
- `pnpm build:docs` - Same as build

## Test

- `pnpm test` - Runs markdown-magic transforms against test files in `test/**/*.md`

## Lint/Format

- `pnpm check:format` - Check formatting with Biome
- `pnpm format` - Auto-fix formatting with Biome

## Key Files

- `src/index.cjs` - Main entry point and CLI
- `src/md-magic.config.cjs` - Configuration for markdown-magic
- `src/transforms/` - Transform implementations (INCLUDE, PACKAGE_SCOPE_NOTICE, etc.)
- `src/templates/` - Markdown templates for various package notice types
- `bin/markdown-magic` - CLI binary

## CLI Usage

```shell
markdown-magic --files <glob patterns> [--workingDirectory <dir>]
```

## Notes

- This is a CommonJS package (`.cjs` files)
- Private package - not published to npm
- Transforms use `<!-- AUTO-GENERATED-CONTENT:START (<TRANSFORM_NAME>) -->` pragma syntax
- Key transforms: `INCLUDE`, `LIBRARY_README_HEADER`, `README_FOOTER`, `PACKAGE_SCOPE_NOTICE`, `INSTALLATION_INSTRUCTIONS`, `API_DOCS`

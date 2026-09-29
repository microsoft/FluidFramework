# Development

## Type-checking

This package sets [`skipLibCheck`](https://www.typescriptlang.org/tsconfig/skipLibCheck.html) in `tsconfig.json` because declarations in the remark dependency tree do not resolve all of their imported modules with pnpm's isolated dependency layout.

Without this setting, TypeScript reports that declarations from `remark-mdx`, `remark-parse`, and `remark-stringify` cannot resolve `unified` or `vfile`.
These errors occur in third-party declaration files, not in this package's source files.
The setting skips type checking for dependency declaration files but continues to type-check this package's source files and tests.

Remove this setting when the affected packages declare the modules that their declarations import, or when TypeScript and pnpm can resolve those imports without additional package metadata.

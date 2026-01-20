# Server/Routerlicious Development Guide

## ESLint Configuration

This workspace uses ESLint 9 with the flat config format (`eslint.config.mts` files). The shared
ESLint configuration is imported from `@fluidframework/eslint-config-fluid` located in
`common/build/eslint-config-fluid`.

### Transitive ESLint Dependencies

The `@fluidframework/eslint-config-fluid` package is referenced using the `link:` protocol:

```json
"@fluidframework/eslint-config-fluid": "link:../../common/build/eslint-config-fluid"
```

This is necessary because the eslint-config-fluid package is not published to npm and exists in a
separate pnpm workspace (`common/build/`). However, the `link:` protocol does **not** automatically
install transitive dependencies from the linked package.

To ensure the transitive ESLint plugin dependencies are available, this workspace uses a
`postinstall` script that runs `pnpm install` in the eslint-config-fluid directory:

```json
"postinstall": "cd ../../common/build/eslint-config-fluid && pnpm install"
```

This approach ensures all ESLint plugins declared in eslint-config-fluid's `package.json` are
installed without needing to duplicate them in this workspace's root `package.json`.

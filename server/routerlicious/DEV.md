# Server/Routerlicious Development Guide

## ESLint Configuration

This workspace uses ESLint 9 with the flat config format (`eslint.config.mts` files). The shared
ESLint configuration is imported from `@fluidframework/eslint-config-fluid` located in
`common/build/eslint-config-fluid`.

### Workaround: Transitive ESLint Dependencies

The `@fluidframework/eslint-config-fluid` package is referenced using the `link:` protocol:

```json
"@fluidframework/eslint-config-fluid": "link:../../common/build/eslint-config-fluid"
```

This is necessary because the eslint-config-fluid package is not published to npm and exists in a
separate pnpm workspace (`common/build/`). However, the `link:` protocol does **not** automatically
install transitive dependencies from the linked package.

As a workaround, the following ESLint plugin dependencies are duplicated in this workspace's root
`package.json`. These are the same dependencies declared in `eslint-config-fluid/package.json`:

| Dependency | Version | Notes |
|------------|---------|-------|
| `@eslint-community/eslint-plugin-eslint-comments` | `~4.5.0` | ESLint comments plugin |
| `@eslint/eslintrc` | `^3.3.3` | For FlatCompat (legacy config support) |
| `@eslint/js` | `^9.39.2` | ESLint core rules |
| `@fluid-internal/eslint-plugin-fluid` | `^0.4.1` | Fluid-specific rules |
| `@typescript-eslint/eslint-plugin` | `~8.18.2` | TypeScript ESLint rules |
| `@typescript-eslint/parser` | `~8.18.2` | TypeScript parser |
| `eslint-config-biome` | `~2.1.3` | Biome compatibility |
| `eslint-config-prettier` | `~10.1.8` | Prettier compatibility |
| `eslint-import-resolver-typescript` | `^4.4.4` | TypeScript import resolution |
| `eslint-plugin-depend` | `~1.4.0` | Dependency banning |
| `eslint-plugin-import-x` | `~4.16.1` | Import rules |
| `eslint-plugin-jsdoc` | `~61.5.0` | JSDoc rules |
| `eslint-plugin-promise` | `~7.2.1` | Promise rules |
| `eslint-plugin-react` | `~7.37.5` | React rules |
| `eslint-plugin-react-hooks` | `~7.0.1` | React hooks rules |
| `eslint-plugin-tsdoc` | `~0.5.0` | TSDoc rules |
| `eslint-plugin-unicorn` | `~56.0.1` | Unicorn rules |
| `eslint-plugin-unused-imports` | `~4.3.0` | Unused imports |
| `jiti` | `^2.6.1` | TypeScript config loader |
| `typescript-eslint` | `^8.52.0` | TypeScript ESLint integration |

### When This Workaround Can Be Removed

This workaround can be removed when **either** of the following conditions is met:

1. **eslint-config-fluid is published to npm**: Once the package is published and consumed via a
   normal version specifier (e.g., `"@fluidframework/eslint-config-fluid": "^9.0.0"`), pnpm will
   automatically resolve and install all transitive dependencies.

2. **Workspaces are consolidated**: If `common/build/eslint-config-fluid` is moved into the same
   pnpm workspace as `server/routerlicious`, the `workspace:` protocol can be used instead of
   `link:`, which properly handles transitive dependencies.

When removing this workaround:
1. Remove the ESLint plugin dependencies listed above from `server/routerlicious/package.json`
2. Update the `@fluidframework/eslint-config-fluid` dependency to use a version specifier
3. Run `pnpm install` to update the lockfile
4. Verify ESLint still works: `pnpm eslint`

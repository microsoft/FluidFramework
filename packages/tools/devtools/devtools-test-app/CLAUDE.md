# @fluid-private/devtools-test-app

Example application demonstrating Fluid devtools integration.

## Build

- `pnpm build` - Full build
- `pnpm build:compile` - Compile TypeScript
- `pnpm webpack` - Build production bundle
- `pnpm webpack:dev` - Build development bundle

## Test

- `pnpm test` - Run Jest tests
- `pnpm test:coverage` - Run tests with coverage

## Development

- `pnpm start` - Start dev server with watch mode for all devtools packages
- `pnpm start:client` - Start webpack dev server only

## Watch Commands

- `pnpm watch:esnext` - Watch this package
- `pnpm watch:devtools-core` - Watch devtools-core changes
- `pnpm watch:devtools-view` - Watch devtools-view changes

## Lint/Format

- `pnpm lint` - Run all linting
- `pnpm format` - Format with Biome

## Key Dependencies

- `@fluid-internal/devtools-view` - Devtools UI
- `@fluidframework/devtools-core` - Core devtools
- `@fluentui/react-components` - Fluent UI
- React 18 with re-resizable for UI layout

## Notes

- Private package (not published)
- Use `pnpm start` for development with hot reloading
- Demonstrates integration patterns for devtools

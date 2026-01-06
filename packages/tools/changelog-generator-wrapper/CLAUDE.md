# @fluid-private/changelog-generator-wrapper

Wrapper for changelog generation using changesets.

## Build

- `pnpm build` - Build and lint (no TypeScript compilation required)
- `pnpm lint` - Run ESLint

## Lint/Format

- `pnpm format` - Format code with Biome
- `pnpm eslint:fix` - Fix ESLint issues

## Key Dependencies

- `@changesets/cli` - Changelog generation
- `changesets-format-with-issue-links` - Formatting with issue links

## Notes

- Private package (not published)
- No TypeScript compilation needed (`tsc` script is a no-op)
- CommonJS module type

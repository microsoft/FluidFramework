# @fluid-example/shared-tree-demo

A shared tree demo using React and ODSP (OneDrive/SharePoint) client.

## Build

- `pnpm build` - Build the package
- `pnpm build:esnext` - TypeScript compilation only
- `pnpm webpack` - Production webpack build
- `pnpm clean` - Clean build artifacts

## Run

- `pnpm start` - Start webpack dev server

## Lint

- `pnpm lint` - Run all linting
- `pnpm eslint` - Run ESLint only
- `pnpm check:format` - Check Biome formatting
- `pnpm format` - Auto-fix formatting with Biome

## Notes

- This is a private example package (not published to npm)
- Uses `@fluidframework/odsp-client` for OneDrive/SharePoint connectivity
- Requires Azure AD authentication via `@azure/msal-browser`
- React-based UI with Tailwind CSS for styling
- No local Tinylicious option - requires ODSP backend configuration
- May require `.env` file configuration (uses dotenv-webpack)

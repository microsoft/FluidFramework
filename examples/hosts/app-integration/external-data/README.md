# @fluid-example/app-integration-external-data

This example demonstrates how data from an external data source (e.g. a work tracking system) might be integrated with Fluid to enable more-real-time collaboration. For example, to allow collaborators to see proposed changes updating live before committing them back to the database.

Please note that the ideas explored here are experimental and under development. They are not yet recommended for broad use in production.

## Scenario

TBD

## Strategy overview

TBD

## Generalizing to other data sources

TBD

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

## Getting Started

You can run this example using the following steps:

1. Install [pnpm](https://pnpm.io/) by running `npm i -g pnpm`.
1. Run `pnpm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/app-integration-external-data`
1. Run `npm start` from this directory (examples/hosts/app-integration/external-data) and open <http://localhost:8080> in a web browser to see the app running.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Testing

```bash
    npm run test:jest
```

For in browser testing update `./jest-puppeteer.config.js` to:

```javascript
  launch: {
    dumpio: true, // output browser console to cmd line
    slowMo: 500,
    headless: false,
  },
```

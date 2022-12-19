# @fluid-example/app-integration-external-data

This example demonstrates how data from an external data source (e.g. a work tracking system) might be integrated with Fluid to enable more-real-time collaboration.  For example, to allow collaborators to see proposed changes updating live before committing them back to the database.

Please note that the ideas explored here are experimental and under development.  They are not yet recommended for broad use in production.

## Scenario

TBD

## Strategy overview

TBD

## Generalizing to other data sources

TBD

## Getting Started

You can run this example using the following steps:

1. Run `npm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/app-integration-external-data`
1. Run `npm start` from this directory (examples/hosts/app-integration/external-data) and open <http://localhost:8080> in a web browser to see the app running.
    - This also launches a `tinylicious` server instance running on port `7070`.

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

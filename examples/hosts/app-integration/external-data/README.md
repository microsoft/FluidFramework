# @fluid-example/app-integration-external-data

This example demonstrates how data from an external data source (e.g. a work tracking system) might be integrated with Fluid to enable more-real-time collaboration. For example, to allow collaborators to see proposed changes updating live before committing them back to the database.

Please note that the ideas explored here are experimental and under development. They are not yet recommended for broad use in production.

## Scenario

This example demonstrates a scenario in which the Customers "source of truth" of their data lives in a service that is external to the Fluid service. The Customers can then:
1. Import the external data into a Fluid collboration session.
2. Export data from a Fluid collaboration session back to the source of truth.
3. Sync updates between Fluid and the source of truth in as close to real-time as the scenario allows.

In this case, the Fluid collaboration session serves as a "drafting surface" in which clients collaborate to create a draft of the data and then send the saved data back to the source of truth for long term storage. 

## Strategy overview

This example repo explores two routes to implement the scenario above. One is the Echo Webhook Pattern and the other is the Bot Pattern. Both are documented in more detail below. However, they both operate in the following environment: many data sources (that would hold the "source of truth" of their data) offer explicit commit style interfaces (e.g. vi REST call or similar) which are not well suited to rapid updates. However, theyoften expose third-party integration via REST APIS for uerying and manipulating data, as well as webhooks for watching updates to the data. 

We have created a mock external service that offers this REST API collection and webhook interfaces in ./src/mock-external-data-service.

### Echo Webhook Pattern

TODO: Document the echo-webhook pattern and how it is surfaced in the example code.

### Bot Pattern

TODO: Document the bot pattern and how it is surfaced in the example code.

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

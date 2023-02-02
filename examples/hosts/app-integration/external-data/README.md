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

Many services that would hold the "source of truth" data offer explicit commit style interfaces (e.g. vi REST call or similar) which are not well suited to rapid updates. However, they often expose third-party integration via REST APIS for querying and manipulating data, as well as webhooks for watching updates to the data.

This repo contains an external service that serves as a mock external "source of truth" data server, that offers this REST API collection and webhook interfaces in ./src/mock-external-data-service. The APIs served by this external service are the following:

1. POST `/register-for-webhook`
2. GET `/fetch-tasks`
3. POST `/set-tasks`
4. POST `/debug-reset-task-list`

Find the documentation for them in the code itself: (./src/mock-external-data-service/service.ts)[./src/mock-external-data-service/service.ts]

Next we need a service that will register the webhooks and listen for incoming changes. In a true implementation, this registration would happen in the Fluid server-side, potentially in the Alfred service, as we have in our dev branch here: https://github.com/microsoft/FluidFramework/blob/dev/external-data-prototyping/server/routerlicious/packages/lambdas/src/alfred/index.ts#L463-L508.

However, for the purposes of this example, we have built out a separate service to register for the webhook. It contains the following endpoints:

1. POST `/register-for-webhook`
2. POST `/echo-external-data-webhook`

Find the details in the code here: (examples/hosts/app-integration/external-data/src/mock-customer-service/service.ts)[examples/hosts/app-integration/external-data/src/mock-customer-service/service.ts]

Next we come to how the Fluid collaboration session and clients will consume the APIs above and render them to the screen. To accomplish that, this example repo explores two routes to implement the scenario above. One is the Echo Webhook Pattern and the other is the Bot Pattern. Both are documented in more detail below.

### Echo Webhook Pattern

<img width="1356" alt="image" src="https://user-images.githubusercontent.com/6777404/216415477-14d0b193-29c9-48e5-8b6b-0a549a5dde58.png">

<img width="1404" alt="image" src="https://user-images.githubusercontent.com/6777404/216417448-2a43db3e-12a2-48a6-b6d0-a6c4a95e27d1.png">

<img width="1374" alt="image" src="https://user-images.githubusercontent.com/6777404/216417779-12861504-7909-489c-b7a2-4d75814a396f.png">

In this pattern. the indivdual clients are responsible for authenticatin with the external data source and making REST calls as needed. However, since the the "customer server" from the section prior, is registered to the webhooks and listening for incoming changes, the clients do not have a way to know that there has been a change upstream. The "echo webhook" pattern is therefore a signal that the server side broadcasts to the Fluid service to echo the information that it has received from the webhook that there is incoming information.

The clients (or elected leader client) can then send a fetch call to retrieve the information and dsiplay it to screen by making a call to the external data server's GET `/fetch-tasks` endpoint.

In this example, we have opted for a signal to be broadcast to relay this information. On receipt of the signal, the clients send a fetch request to pull the data from the external-data server. This data is stored in a SharedMap known as "SavedData", whereas the local collaboration state is stored in a SharedMap known as "DraftData". This is known as the draft data, as we are treating the Fluid collaboration session as a drafting surface, which will eventually get pushed back to the External Data Server for longer term storage.

Upon receipt of new external data, the external data is written immediately into the "SavedData" map, and a check occurs comparing the SavedData to the DraftData. If there are changes between the two, these are displayed on screen and the clients can (currently) only choose to consume the changes and overwrite their local data, via using regular ops mechanism. The first person to overwrite will use regular ops to write into the FluidData and the change will be attributed to them.

The collaboration session can continue as expected, and when the collboartion session is ready to be closed, the clients can simply Save Changes to write back to the External Data Source by making a request to the External Data Server's POST `/set-tasks` endpoint.

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

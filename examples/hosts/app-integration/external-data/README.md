# @fluid-example/app-integration-external-data

This example demonstrates how data from an external data source (e.g. a work tracking system) might be integrated with Fluid to enable more-real-time collaboration. For example, to allow collaborators to see proposed changes updating live before committing them back to the database.

Please note that the ideas explored here are experimental and under development. They are not yet recommended for broad use in production.

## Scenario

This example demonstrates a scenario in which the "source of truth" of the customer data lives in a service that is external to the Fluid service. Customers can then:

1. Import the external data into a Fluid collaboration session.
2. Export data from a Fluid collaboration session back to the source of truth.
3. Sync updates between Fluid and the source of truth in as close to real-time as the scenario allows.

In this case, the Fluid collaboration session serves as a "drafting surface" in which clients collaborate to create a draft of the data and then send the saved data back to the source of truth for long term storage.

## Strategy overview

In order to accomplish the goals above, we have split up the responsibilities into a few different pieces:

**External Data Service**

Many services that would hold the "source of truth" data offer explicit commit style interfaces (e.g. vi REST call or similar) which are not well suited to rapid updates.
However, they often expose third-party integration via REST APIS for querying and manipulating data, as well as webhooks for watching updates to the data.

This repo contains a service that mocks the external "source of truth" data server. This mock service offers a REST API collection and webhook interfaces in `./src/mock-external-data-service`. The API requests served by this "external" service are the following:

1. POST `/register-for-webhook`: Register's the sender's URL to receive notifications when the external task-list data changes. Currently, the Customer Service registers its `/external-data-webhook` endpoint here to be called when data changes.
2. GET `/fetch-tasks`: Fetches the task list from the external data store. Called by the Fluid client.
3. POST `/set-tasks`: Updates external data store with new tasks list (complete override). Called by the Fluid client.
4. POST `/debug-reset-task-list`: Resets the external data to its original contents. Called by the Fluid client.

Find the details of the API in the [External Data Service README](./src/mock-external-data-service/README.md)

**Customer Service**

Next we need a customer service that functions as the intermediary between the External Data Service and the Fluid Service. This server is responsible for authenticating to the external service on the customer's behalf. It registers to the External Data Service webhooks and listens for incoming changes. It also acts as a translation layer, translating to and from the External Data Service expected format and the Fluid Service's expected format.

In this example, the Customer Service contains the following endpoints:

1. POST `/external-data-webhook`: Registered to be called by the External Data Service webhook when there's been a change to data upstream. On being called, the Customer Service behaves in different ways given the two patterns listed below. For the echo webhook pattern, it calls the `broadcast-signal` endpoint in the Fluid Service. More details below in the Echo Webhook Pattern section. Note that this is a route established by the customer service to be used exclusively as a subscription endpoint for the external data service's webhook, and should be considered a private implementation detail to the service. Customers may choose to implement this differently.

Find the details of the API in the [Customer Service README](./src/mock-customer-service/README.md).

Next we come to how the Fluid collaboration session and clients will consume the APIs above and render the data to the screen. This example repo explores two routes to accomplish this. One is the Echo Webhook Pattern and the other is the Bot Pattern. Both are documented in more detail below.

### Echo Webhook Pattern

<img width="1356" alt="Scenario: Collaboration session gets an update from outside of Fluid" src="https://user-images.githubusercontent.com/6777404/216415477-14d0b193-29c9-48e5-8b6b-0a549a5dde58.png">

<img width="1404" alt="Scenario: Collaboration session gets an update from outside of Fluid" src="https://user-images.githubusercontent.com/6777404/216417448-2a43db3e-12a2-48a6-b6d0-a6c4a95e27d1.png">

<img width="1374" alt="Scenario: EXternal data is updated from within Fluid,if only authenticated users are able to write" src="https://user-images.githubusercontent.com/6777404/216417779-12861504-7909-489c-b7a2-4d75814a396f.png">

In the architecture so far, since the Customer Service is registered to the webhooks and listening for incoming changes, the clients do not have a way to know that there has been a change upstream. So the last piece of the puzzle here is an endpoint in the Fluid Service:

1. POST `broadcast-signal`: Broadcasts a Signal to the clients to alert them of an upstream change. Called by the Customer Service to let the Fluid service know that there has been a change in the data.

In this way, it "echoes" the webhook from the External Data Service to the Customer Service. A prototype of the webhook subscription and signal broadcast lives is currently prototyped in Alfred [in a dev branch](https://github.com/microsoft/FluidFramework/blob/dev/external-data-prototyping/server/routerlicious/packages/lambdas/src/alfred/index.ts).

On receiving the signal, the clients (or elected leader client) can then send a fetch call to retrieve the information and display it to screen by making a call to the external data server's GET `/fetch-tasks` endpoint.

The client can then display the diff on the screen and the users can choose how to reconcile the changes.

Once the changes are reconciled, the collaboration session can continue as expected, and when the collaboration session is ready to be closed, the clients can simply Save Changes to write back to the External Data Source by making a request to the External Data Server's POST `/set-tasks` endpoint.

### Bot Pattern

TODO: Document the bot pattern and how it is surfaced in the example code.

## Generalizing to other data sources

TBD

### Concepts of data in this repository

A few useful concepts to understand in implementing conflict resolution in this app:

Task - This is the unit that can be edited and attributed to an author. It is also the level at which conflict resolution currently takes place. The task holds knowledge of the local edits as well as the external edits and can display one or both to the screen.

TaskList - This can be compared to a "board" that holds all of the tasks. It is the larger visible entity to show up in a component within the app. The app stores two types of TaskLists - a "draft" version and a "saved version". More on these below.

SavedData - Data that comes in fresh from the external data source is first stored in a [SharedMap](https://fluidframework.com/docs/data-structures/map/) known as "SavedData".

DraftData - Local collaboration state between the Fluid clients is stored in a SharedMap known as "DraftData". This is known as draft data because we are treating the Fluid collaboration session as a drafting surface.

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

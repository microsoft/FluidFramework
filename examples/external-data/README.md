# @fluid-example/app-integration-external-data

This example demonstrates how data from an external data source (e.g. a work tracking system) might be integrated with Fluid to enable more-real-time collaboration. For example, to allow collaborators to see proposed changes updating live before committing them back to the database.

Please note that the ideas explored here are experimental and under development. They are not yet recommended for broad use in production. When this changes, we will update the documents accordingly.

## Scenario

This example demonstrates a scenario in which the "source of truth" of the customer data lives in a service that is external to the Fluid service. Customers can then:

1. Import the external data into a Fluid collaboration session.
2. Export data from a Fluid collaboration session back to the source of truth.
3. Sync updates between Fluid and the source of truth in as close to real-time as the scenario allows.

In this case, the Fluid collaboration session serves as a "drafting surface" in which clients collaborate to create a draft of the data and then send the saved data back to the source of truth for long term storage.

## Strategy overview

In order to accomplish the goals above, we have split up the responsibilities into a few different pieces:

### External Data Service

Many services that would hold the "source of truth" data offer explicit commit style interfaces (e.g. via REST call or similar) which are not well suited to rapid updates.
However, they often expose third-party integration via REST APIS for querying and manipulating data, as well as webhooks for watching updates to the data.

This repo contains a service that mocks the external "source of truth" data server. This mock service offers a REST API collection and webhook interfaces in `./src/mock-external-data-service`. The API requests served by this "external" service are the following:

1. POST `/register-for-webhook?externalTaskListId=XXX`. Required body parameters: `url` (string). Registers the sender's URL to receive notifications when the external task-list data changes. Currently, the Customer Service registers its `/external-data-webhook` endpoint here to be called when data changes.
2. GET `/fetch-tasks/:externalTaskListId`: Fetches the task list from the external data store. Called by the Fluid client.
3. POST `/set-tasks/:externalTaskListId`: Updates external data store with new tasks list (complete override). Called by the Fluid client.

Find the details of the API in the [External Data Service README](./src/mock-external-data-service/README.md)

### Customer Service

Next we need a customer service that functions as the intermediary between the External Data Service and the Fluid Service. This server is responsible for authenticating to the external service on the customer's behalf. It registers to the External Data Service webhooks and listens for incoming changes. It also acts as a translation layer, translating to and from the External Data Service expected format and the Fluid Service's expected format.

In this example, the Customer Service contains the following endpoints:

1.POST `/register-session-url`. Required body parameters: `containerUrl` (string), `externalTaskListId` (string). Creates an entry in the Customer Service of the mapping between the container and the external resource id. It then calls the External Service's `/register-for-webhook` endpoint to call it's own `/external-data-webhook?externalTaskListId=XXX` endpoint (details below), in order to notify the Fluid Service containers subscribed to that externalTaskListId of the corresponding change.

2. POST `/external-data-webhook`. Required querystring parameters: `externalTaskListId`(string). This gets called by the External Data Service when there's been a change to the data and causes the Customer Service to in turn call the `/broadcast-signal` endpoint in the Fluid Service. Note that this is a route established by the Customer Service to be used exclusively as a subscription endpoint for the external data service's webhook and should be considered a private implementation detail to the service. Customers may choose to implement this differently.

Find the details of the API in the [Customer Service README](./src/mock-customer-service/README.md).

### Fluid Service

The `broadcast-signal` endpoint is new and still under construction. We will update it here once it is available to use.

1. POST `/broadcast-signal`. Required body parameters: `containerUrl` (string), `externalTaskListId` (string), `taskData`(ITaskData). This endpoint is called by the Customer Service when it needs the Fluid Service to notify the Fluid clients that there has been a change to the upstream data. The body must contain the `containerUrl`, from which we can extract a few pieces relevant to the Fluid service: the `socketStreamUrl`, the `containerId` (sometimes known as the `documentId`), and the `tenantId`. The Fluid service will broadcast a signal of type `SignalType.RuntimeSignal` to the clients to alert them of the change. In this way, it "echoes" the webhook call from the External Data Service to the Customer Service.

This example uses the tinylicious driver to stub out what changes will be necessary in the odsp-driver. The prototype of the full signal and driver flow can be seen in this [`dev/external-data-prototyping` branch to main comparison](https://github.com/microsoft/FluidFramework/compare/main...dev/external-data-prototyping).

#### Fluid Client

On receiving the signal, the clients (or elected leader client) can then send a fetch call to retrieve the information and display it to screen by making a call to the external data server's GET `/fetch-tasks` endpoint.

The client can then display the diff on the screen and the users can choose how to reconcile the changes.

Once the changes are reconciled, the collaboration session can continue as expected, and when the collaboration session is ready to be closed, the clients can simply Save Changes to write back to the External Data Source by making a request to the External Data Server's POST `/set-tasks` endpoint.

### Functional Flows

#### Set up on client joining a collaboration session

<img width="80%" alt="Client calls Customer Service's /register-session-url endpoint with externalTaskListId and containerUrl" src="https://user-images.githubusercontent.com/6777404/226771104-6a87b5e2-9f5f-4eb6-a97d-c83c98c95d73.png">

<img width="80%" alt="Customer Service creates a registry entry mapping externalTaskListId to containerUrl and calls External Server's /register-for-webhook endpoint for registering for changes in that externalTaskListId" src="https://user-images.githubusercontent.com/6777404/226746263-baea46a1-822a-4bda-838d-be1fae7387db.png">

<img width="80%" alt="Client calls External Server's /fetch-tasks endpoint" src="https://user-images.githubusercontent.com/6777404/226746310-d89db865-ab29-495a-97be-9cf59490e9be.png">

#### Data changes on External Service

<img width="80%" alt="External Server calls Customer Service's /external-data-webhook endpoint with notification that externalTaskListId data has changed" src="https://user-images.githubusercontent.com/6777404/226746508-04ff2ba0-99a1-4115-8a33-d3ae63cefaf5.png">

<img width="80%" alt="Customer Service looks up the externalTaskListId in its registry and finds a containerUrl subscribed for changes to it, so it calls FLuid Service's /broadcast-signal endpoint passing on the containerUrl" src="https://user-images.githubusercontent.com/6777404/226766084-28a44c45-38d2-4e6c-a665-50d8cd759ca1.png">

<img width="80%" alt="Fluid Service receives the /broadcast-signal event and containerUrl information and broadcasts a signal to the correct container which notifies the clients of changes upstream" src="https://user-images.githubusercontent.com/6777404/226748490-9117040c-ed0f-43e3-9b29-01c639c57031.png">

<img width="80%" alt="Optionally, if the data is not transmitted through the signal, the client can fetch the data directly from the External Server's /fetch-tasks endpoint" src="https://user-images.githubusercontent.com/6777404/226767551-7f70f9a2-3160-44f6-8f6a-a6d0ffc28367.png">

#### Collaboration session ends

<img width="80%" alt="At the end of the collaboration session the client can update the External Server of the final state by calling the External Server's /set-tasks endpoint" src="https://user-images.githubusercontent.com/6777404/226747205-91cc0d33-1734-4d51-86c0-f886d0cfef9f.png">

### Concepts of data in this repository

A few useful concepts to understand in implementing conflict resolution in this app:

Task - This is the unit that can be edited and attributed to an author. It is also the level at which conflict resolution currently takes place. The task holds knowledge of the local edits as well as the external edits and can display one or both to the screen.

TaskList - This can be compared to a "board" that holds all of the tasks. It is the larger visible entity to show up in a component within the app. The app stores two types of TaskLists - a "draft" version and a "saved version". More on these below.

TaskList - This can be compared to a "board" that holds a list of related tasks; for example, the results of a particular query. It is the larger visible entity to show up in a component within the app. The app stores two types of TaskLists - a "draft" version and a "saved version". More on these below.

ITaskData - This is similar to Task except that it is the External Data Services model of the task.

ITaskListData - This is similar to TaskList except that it is the External Data Services model of the taskList.

SavedData - Data that comes in fresh from the external data source is first stored in a [SharedMap](https://fluidframework.com/docs/data-structures/map/) known as "SavedData".

DraftData - Local collaboration state between the Fluid clients is stored in a SharedMap known as "DraftData". This is known as draft data because we are treating the Fluid collaboration session as a drafting surface.

<!-- AUTO-GENERATED-CONTENT:START (EXAMPLE_APP_README_HEADER:usesTinylicious=FALSE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

You can run this example using the following steps:

1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.
1. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `pnpm run build:fast --nolint @fluid-example/app-integration-external-data`
1. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser to see the app running.

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

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

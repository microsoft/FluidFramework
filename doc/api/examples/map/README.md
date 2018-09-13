This project provides a basic example of connecting to the Prague service and then making use of the API.

# Building and running 

You'll need [Node 8.+](https://nodejs.org/en/) to build and run the example.

```bash
npm install
npm run build
```

Then open index.html in your browser of choice to view the example

# How it works

The API code itself is loaded by including
`import { api as prague } from "@prague/routerlicious";`
in [src/index.ts](src/index.ts).

The code for the example is in [src/index.ts](src/index.ts). The example loads a collaborative document which contains
a single text string. A basic HTML form is then used to insert text into the string.

To implement this the first step is to register the Routerlicious endpoints.

```typescript
const routerlicious = "http://praguekube.westus2.cloudapp.azure.com";
const historian = "http://prague-historian.westus2.cloudapp.azure.com";
const repository = "prague";
prague.socketStorage.registerAsDefault(routerlicious, historian, repository);
```

The `routerlicious` variable points at the routerlicious servers which handles the delta message flow. The
`historian` endpoint references where snapshots are stored and is itself a REST endpoint to a git repository. For
now `repository` must be set to prague unless you want to make REST requests to historian to provision a new
repository. Documents are branches off of this repository.

Should you wish to target a local instance of routerlicious just switch those two variables to point at localhost.
The local endpoints are commented out in the code for convenience.

The next step is connecting to the document.

```typescript
const version = await getLatestVersion(id);
const collabDoc = await prague.api.load(id, { blockUpdateMarkers: true }, version);
```

This code gets the latest version of the document (a git commit) and then uses the API to load the document.

Once the document is loaded you can begin to access elements within it.

```typescript
const rootView = await collabDoc.getRoot().getView();
if (!rootView.has("text")) {
    rootView.set("text", collabDoc.createString());
}
const text = rootView.get("text");

...

text.on("op", (msg) => {
    textElement.innerText = text.client.getText();
});

...

text.insertText(insertText, insertPosition);
```

A document is a collection of collaborative objects accessible from a root map. Every collaborative object has
a root map that can be accessed via the `getRoot()` call. The default map provides async methods to access the map.
But you can make use of `getView()` to retrieve a view of the map that provides synchronous access to the map.

The example then checks to see if there is already a text element registered and if not creates one. Once it retrives
the shared string it listens for changes to it via the `on` method.

Adding text back into the document is as simple as calling the `insertText` method.

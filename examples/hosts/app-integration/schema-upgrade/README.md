# @fluid-example/app-integration-schema-upgrade

This demo experiments with an approach for migrating data from an existing Fluid container into a new Fluid container which may have a different schema or code running on it.

Please note that the ideas explored here are experimental and under development.  They are not yet recommended for broad use in production.

## Scenario

Once a Fluid container has been created, it will contain some set of persisted data in the form of the summary as well as any unsummarized ops.  This persisted data can only be correctly interpreted by a compatible container code (typically the same one that created it, or a newer backwards-compatible one).  This container code knows the appropriate data stores to load to interpret the summary and process the outstanding ops, as well as provides public access to those data stores for use.

However, suppose you want to change your application's schema in a manner that is not backwards compatible.  Examples of this might include:
- Changing a DDS type used to store some data (e.g. Cell -> Map as this demo demonstrates)
- Removing a piece of the data that is no longer relevant (e.g. for an app feature that has been removed)
- Reorganize data (e.g. split Directory data into subdirectories, or change the key used for a value in a Map)

## Strategy overview

This example explores one technique to permit these types of changes.  It employs a multi-stage process to do so:
1. Reach consensus amongst connected clients to perform the migration
1. Extract the data from the existing container
1. Transform the data as needed
1. Create a new container with the new code and import the transformed data
1. Redirect clients to the new container

### Reach consensus amongst connected clients to perform the migration
TODO

### Extract the data from the existing container
TODO

### Transform the data as needed
TODO

### Create a new container with the new code and import the transformed data
TODO

### Redirect clients to the new container
TODO

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED:tinylicious=true) -->
<!-- The getting started instructions are automatically generated.
To update them, edit docs/md-magic.config.js, then run 'npm run build:md-magic' -->

## Getting Started

You can run this example using the following steps:

1. Run `npm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
   a. For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/app-integration-schema-upgrade`
1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](../../../server/tinylicious).
1. Run `npm run start` from this directory (examples/hosts/app-integration/schema-upgrade) and open <http://localhost:8080> in a web browser to see the app running.
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

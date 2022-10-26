# @fluid-example/contact-collection

**Contact collection** demonstrates how a data object can be treated as a collection of multiple smaller objects.

The collection pattern demonstrated here might be a fit for your scenario if:

1. Your data can be described as a homogenous collection of separately usable pieces.
1. The consumers of your data (e.g. views or other data objects) might prefer to operate on a single piece, rather than the full collection.

Whereas a non-collection approach might have a collection data object holding handles to many other completely distinct data objects, the collection approach uses a single data object to organize all the data in one place.  It then provides interfaces to access individual members as standalone objects.  In this example, the `ContactCollection` data object stores contact data with one contact per key in its root, to be accessed through a `Contact` class which is not a data object.  In comparison, the non-collection approach would have stored handles to separate `Contact` (full-fledged) data objects.  `@fluid-example/todo` is a good example of the non-collection approach, storing `TodoItem` data objects as handles in the `Todo` data object.

The key feature of the collection pattern is that it facilitates individual retrieval of a piece for use in consumers that don't wish to operate on (or shouldn't have access to) the full collection.  This enables you to retain the granular access that individual data objects provide without the overhead of data object creation and async access of handles.

The specific access mechanisms can vary -- in this example, `ContactCollection` has `getContacts()` and `getContact()` methods which return `Contact` objects.  `getContacts()` is used in the `renderContactCollection()` view, and `getContact()` is used by the app to retrieve a singular `Contact` for use with the `renderContact()` view.

For another example of this pattern, consider the `SharedDirectory` DDS.  The `getWorkingDirectory()` method allows granular access to an `IDirectory` that can be used separately from the remainder of the `SharedDirectory`, despite the data being stored in the same data store.  Although the details differ since it is a DDS rather than a data object, the principle is the same.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED:tinylicious=true) -->
<!-- This section is automatically generated.
To update it, edit docs/md-magic.config.js  then run 'npm run build:md-magic' in the docs folder. -->

## Getting Started

You can run this example using the following steps:

1. Run `npm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/contact-collection`
1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](../../../server/tinylicious).
1. Run `npm run start` from this directory (examples/apps/contact-collection) and open <http://localhost:8080> in a web browser to see the app running.

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

## Data model

Contact collection uses the following distributed data structures:

- SharedDirectory -- root

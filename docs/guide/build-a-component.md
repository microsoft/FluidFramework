---
uid: build-a-component
---

# Build a component

::: warning
This documentation is based on an earlier version of the Fluid Framework and is outdated.

Track the documentation update with [#641](https://github.com/microsoft/FluidFramework/issues/641).
:::

If you haven't already, you should [install and run yo fluid](./yo-fluid.md) and use it to generate scaffolding for a
new component.

Within your project folder you can use the following commands:

`npm start` -- Builds and hosts the component at <http://localhost:8080>

`npm run build` -- Builds the component into bundled js files

`npm run deploy` -- Publishes the component to Verdaccio, the Fluid team's private NPM repository (located at
<https://packages.wu2.prague.office-int.com/#>)


## Development process

While you're developing your component, you can test and debug your code locally using `npm start`. This will load your
component code from a local web server, but will use the Fluid team's hosted Fluid server,
[Routerlicious](../architecture/server/), as the Fluid server.

## Sharing your component

### Publish your package

Congratulations, you have a component! Now it's time to share it. First, you need to publish your package to Verdaccio,
the Fluid team's private NPM repository. To do that, use `npm run deploy`. This will bump the patch version of your
package, build it, and publish the result to Verdaccio. It will also provide you a URL to your component of the form
`https://www.wu2-ppe.prague.office-int.com/waterpark?chaincode=@chaincode/<your-package>`, which
you can use to load your component into the Water Park.

::: tip

This is a spiritual equivalent to publishing to npmjs.org

:::

### Load your component in the Water Park

See [the Water Park docs](./water-park.md).

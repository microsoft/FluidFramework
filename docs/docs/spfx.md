# SPFx documentation

## Public documentation

Unless otherwise noted here, the [SPFx public documentation](https://aka.ms/spfx)can be used as a guide.

## Preparing your solution

Two guids have to be updated for each new solution uploaded to the same catalog:

1. `solution.id` in `config/package-solution.json`
2. `id` in `src/Component.manifest.json`

Other properties in the two json config files may additionally be updated; refer to the public schema for more details.

## Accessing Fluid APIs

`this.context.sdks.fluid` provides access to the Fluid runtime, context, and a pre-registered SharedDirectory.

## BaseClientSideWebPart

The `BaseClientSideWebPart` base class should be imported from `@ms/mfx-part-base` and **not** `@microsoft/sp-webpart-base`.

## Registering new DDS

If your Fluid Part needs to register DDS, `MFxComponentFactory.makeFluid` takes an `ISharedObjectFactory[]` as the
third argument. DDS can be created for the first time or retrieved in the `BaseClientSideWebPart.onInit` lifecycle
method. The `this.renderedFromPersistedData` property indicates whether the Fluid Part is initializing for the
first time; false indicates first time initialization.

## Package and deployment

`gulp bundle` builds the code. `gulp package-solution` produces a SharePoint solution package (sppkg), which will be under
a `sharepoint` folder created in the project root. If you want to build a ship solution, then run `gulp bundle --ship` and
`gulp package-solution --ship`. The two commands must have the same arguments.

## Inner loop

### Local Debugging

Running `npm run start:local` then navigating to http://localhost:8080/ will let you test your Components locally.

### Dev loop with fluidPreview.com

Uploading a non-ship solution will have the manifest resolve scripts from localhost. If this is the first time, run
`gulp trust-dev-cert` to accept a local certificate. Run `gulp serve -l --nobrowser` to start a local server to serve
debug scripts. Code changes will automatically be rebuilt and served. Either refresh the page or delete/add the Fluid
Part.

::: tip

The [Fluid tutorials](../tutorials/README.md) include npm script wrappers around the gulp commands above. If you do not
wish to install gulp globally, you can use the npm scripts instead. For example:

| npm Script       | Command                                     |
| ---------------- | ------------------------------------------- |
| `build`          | `npm run bundle && npm run package`         |
| `build:dev`      | `npm run bundle:dev && npm run package:dev` |
| `bundle`         | `gulp bundle --ship`                        |
| `bundle:dev`     | `gulp bundle`                               |
| `package`        | `gulp package-solution --ship`              |
| `package:dev`    | `gulp package-solution`                     |
| `serve`          | `gulp serve`                                |
| `trust-dev-cert` | `gulp trust-dev-cert`                       |

:::

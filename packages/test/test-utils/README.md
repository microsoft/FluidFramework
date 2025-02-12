# @fluidframework/test-utils

This package contains utilities for writing end-to-end tests in Fluid Framework. It helps in the creation of a simple hosting application to test Fluid objects and other functionalities of the system.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER:devDependency=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library's public APIs, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

If using any of Fluid Framework's unstable APIs (for example, its `beta` APIs), we recommend using a more constrained version range, such as `~`.

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluidframework/test-utils -D
```

## Importing from this package

This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.
For more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

To access the `public` ([SemVer](https://semver.org/)) APIs, import via `@fluidframework/test-utils` like normal.

To access the `legacy` APIs, import via `@fluidframework/test-utils/legacy`.

## API Documentation

API documentation for **@fluidframework/test-utils** is available at <https://fluidframework.com/docs/apis/test-utils>.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Local Code Loader

`LocalCodeLoader` in `localCodeLoader.ts` is a simple code loader that can load a Fluid package with a given entry point. It can be used to load multiple different Fluid packages with different sources (`IFluidCodeDetails`).

It should be created by passing in a list of source to entry point mapping. Then entry point can be an `IFluidDataStoreFactory`, `IRuntimeFactory` or a `fluidExport`:

```typeScript
// The fluidEntryPoint type.
export type fluidEntryPoint = Partial<IProvideRuntimeFactory & IProvideFluidDataStoreFactory & IFluidModule>;

// Constructor for LocalCodeLoader.
constructor(packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>);
```

On load, it retrieves the `fluidEntryPoint` matching the package in the `IFluidCodeDetails` and loads it.

## Local Loader

`localLoader.ts` contains couple of methods:

### `createLocalLoader`

This method creates a simple `Loader` that can be used to resolve a Container or request a Fluid object.

It should be created with a list of source to entry point mappings (of type `fluidEntryPoint` as explained in [LocalCodeLoader](#Local-Code-Loader) section above), an `ILocalDeltaConnectionServer` and an `IUrlResolver`:

```typeScript
export function createLocalLoader(
    packageEntries: Iterable<[
        IFluidCodeDetails,
        Partial<IProvideRuntimeFactory & IProvideFluidDataStoreFactory & IFluidModule>
    ]>,
    deltaConnectionServer: ILocalDeltaConnectionServer,
    urlResolver: IUrlResolver,
): ILoader;
```

-   It creates a `LocalCodeLoader` using the `fluidEntryPoint` list to load Container code.
-   It creates a `DocumentServiceFactory` which serves as the driver layer between the container and the server.

### `createAndAttachContainer`

This method creates and attaches a `Container` with the given `source` and an `attachRequest`. An `ILoader` should also be passed in that will be used to load the `Container`. The `attachRequest` format varies per url resolver. Most resolvers have helper methods for creating attach requests. You should use the
helper method on the url resolver passed to the loader to generate the `attachRequest`:

```typescript
export async function createAndAttachContainer(
	source: IFluidCodeDetails,
	loader: ILoader,
	attachRequest: IRequest,
): Promise<IContainer>;
```

The usual flow is to create a `LocalLoader` by calling `createLocalLoader` and then using it to call `createAndAttachContainer`. However, this should work with any `ILoader`.

## Test Fluid Object

`testFluidObject.ts` provides `TestFluidObject` and `TestFluidObjectFactory` that help in the testing of Distributed Data Structures (DDS).
It can be used to create a Fluid object (TestFluidObject) with a given set of DDSes which can then be retrieved later as required.

For example, if you need a Fluid object with couple of SharedStrings, a SharedDirectory and a SparseMatrix, create a `TestFluidObjectFactory` as follows and use this factory to create the Fluid object:

```typeScript
new TestFluidObjectFactory([
    [ "sharedString1" /* id */, SharedString.getFactory() ],
    [ "sharedString2" /* id */, SharedString.getFactory() ],
    [ "directory" /* id */, SharedDirectory.getFactory() ],
    [ "matrix" /* id */, SparseMatrix.getFactory() ],
]);
```

The `TestFluidObject` will then create the above DDSes when initializing and they can then be retrieved by calling `getSharedObject` on it and providing the `id` that was used to create it:

```typeScript
const sharedString1 = testFluidObject.getSharedObject<SharedString>("sharedString1");
const sharedString1 = testFluidObject.getSharedObject<SharedString>("sharedString2");
const directory = testFluidObject.getSharedObject<SharedDirectory>("directory");
const matrix = testFluidObject.getSharedObject<SparseMatrix>("matrix");
```

> If you want a DDS to be part of the registry so that it can be created later but don't want `TestFluidObject` to create it during initialization, use `id` as `undefined` in the `TestFluidObjectFactory` creation.

## Op Processing Controller

`OpProcessingController` provides control over op processing in the tests. It lets you pause and resume the op processing in the containers / fluid objects. It also lets you wait until the ops have been processed by them and the server.

`OpProcessingController` should be created by passing in the `ILocalDeltaConnectionServer` that is used in the test. You can then register the Fluid objects / containers whose ops you want to control with it.

For example, consider the scenario where you perform some operations on a DDS and want to verify that the remote client's DDS have applied the operations. You have to wait until the op is sent to the server, the server processes the op, sends it to the remote client and the remote client processes the op.

You can use the `OpProcessingController` to wait for all that to happen by calling `process` on it. Check how [SharedStringTest](../end-to-end-tests/src/test/sharedStringEndToEndTests.spec.ts) does that.

## Usage

The typical usage for testing a Fluid object is as follows:

1. Create a `LocalDeltaConnectionServer`:

    ```typescript
    const deltaConnectionServer: ILocalDeltaConnectionServer = LocalDeltaConnectionServer.create();
    ```

2. Create a `LocalResolver`:

    ```typescript
    const urlResolver: IUrlResolver = new LocalResolver();
    ```

3. Create an `IFluidCodeDetails` and a `TestFluidObjectFactory` which will serve as the Fluid entry point (code details to factory mapping):

    ```typescript
    const codeDetails: IFluidCodeDetails = {
    	package: "sharedStringTestPackage",
    	config: {},
    };
    const entryPoint = new TestFluidObjectFactory([["sharedString", SharedString.getFactory()]]);
    ```

    > This can replaced by any `IFluidDataStoreFactory` or `IRuntimeFactory`. When the loader is asked to resolve a Container with the above code details, it will load the above factory.

4. Create a local `Loader`:

    ```typescript
    const loader: ILoader = createLocalLoader(
    	[[codeDetails, entryPoint]],
    	deltaConnectionServer,
    	urlResolver,
    );
    ```

5. Create and attach a `Container` by giving it a `documentId` which is used as a URL to resolve the container:

    ```typescript
    const documentId = "testDocument";
    const container = await createAndAttachContainer(
    	codeDetails,
    	loader,
    	urlResolver.createCreateNewRequest(documentId),
    );
    ```

    > We used the same `IFluidCodeDetails` that was used to create the `Loader` in step 3.

6. Get the `Fluid object (TestFluidObject)` by using `getEntryPoint()` API on `IContainer`. Then get the `DDS` to test:

    ```typescript
    const fluidObject = await container.getEntryPoint();
    const sharedString = await fluidObject.getSharedObject<SharedString>("sharedString");
    ```

    > The `ITestFluidObject` would have already created a `SharedString` based off the parameters we provided when creating the `TestFluidObjectFactory` in step 2.

7. To truly test collaboration, create a second `Loader`, `Container`, `fluid object` and `DDS` which will serve as a remote client:
    ```typescript
    const documentUrl = `https://localhost/${documentId}`;
    const loader2: ILoader = createLocalLoader(
    	[[codeDetails, entryPoint]],
    	deltaConnectionServer,
    	urlResolver,
    );
    const container2 = await loader2.resolver({ url: documentUrl });
    const fluidObject = await container2.getEntryPoint();
    const sharedString2 = await fluidObject2.getSharedObject<SharedString>("sharedString");
    ```
    > It is important to use the same `ILocalDeltaConnectionServer` to create the `Loader` and the same `documentId` to load the `Container`. This will make sure that we load the `Container` that was created earlier and do not create a new one.

These steps are demonstrated in the image below:

![Image 1](./end-to-end-tests.png)

> Note that the LocalDriver is created by the `createLocalLoader` method and does not need to explicitly created.

## Example

The above usage is taken from [SharedStringTest](../end-to-end-tests/src/test/sharedStringEndToEndTests.spec.ts) which is a very basic example of how to use these utils.

There are a number of other examples (some a little more complex) in the same [directory](../end-to-end-tests/src/test).

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Minimum Client Requirements

These are the platform requirements for the current version of Fluid Framework Client Packages.
These requirements err on the side of being too strict since within a major version they can be relaxed over time, but not made stricter.
For Long Term Support (LTS) versions this can require supporting these platforms for several years.

It is likely that other configurations will work, but they are not supported: if they stop working, we do not consider that a bug.
If you would benefit from support for something not listed here, file an issue and the product team will evaluate your request.
When making such a request please include if the configuration already works (and thus the request is just that it becomes officially supported), or if changes are required to get it working.

### Supported Runtimes

-   NodeJs ^20.10.0 except that we will drop support for it [when NodeJs 20 loses its upstream support on 2026-04-30](https://github.com/nodejs/release#release-schedule), and will support a newer LTS version of NodeJS (22) at least 1 year before 20 is end-of-life. This same policy applies to NodeJS 22 when it is end of life (2027-04-30).
-   Running Fluid in a Node.js environment with the `--no-experimental-fetch` flag is no longer supported.
-   Modern browsers supporting the es2022 standard library: in response to asks we can add explicit support for using babel to polyfill to target specific standards or runtimes (meaning we can avoid/remove use of things that don't polyfill robustly, but otherwise target modern standards).

### Supported Tools

-   TypeScript 5.4:
    -   All [`strict`](https://www.typescriptlang.org/tsconfig) options are supported.
    -   [`strictNullChecks`](https://www.typescriptlang.org/tsconfig) is required.
    -   [Configuration options deprecated in 5.0](https://github.com/microsoft/TypeScript/issues/51909) are not supported.
    -   `exactOptionalPropertyTypes` is currently not fully supported.
        If used, narrowing members of Fluid Framework types types using `in`, `Reflect.has`, `Object.hasOwn` or `Object.prototype.hasOwnProperty` should be avoided as they may incorrectly exclude `undefined` from the possible values in some cases.
-   [webpack](https://webpack.js.org/) 5
    -   We are not intending to be prescriptive about what bundler to use.
        Other bundlers which can handle ES Modules should work, but webpack is the only one we actively test.

### Module Resolution

[`Node16`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) resolution should be used with TypeScript compilerOptions to follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).
Node10 resolution is not supported as it does not support Fluid Framework's API structuring pattern that is used to distinguish stable APIs from those that are in development.

### Module Formats

-   ES Modules:
    ES Modules are the preferred way to consume our client packages (including in NodeJs) and consuming our client packages from ES Modules is fully supported.
-   CommonJs:
    Consuming our client packages as CommonJs is supported only in NodeJS and only for the cases listed below.
    This is done to accommodate some workflows without good ES Module support.
    If you have a workflow you would like included in this list, file an issue.
    Once this list of workflows motivating CommonJS support is empty, we may drop support for CommonJS one year after notice of the change is posted here.

    -   Testing with Jest (which lacks [stable ESM support](https://jestjs.io/docs/ecmascript-modules) due to [unstable APIs in NodeJs](https://github.com/nodejs/node/issues/37648))

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

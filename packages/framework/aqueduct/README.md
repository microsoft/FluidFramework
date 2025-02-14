# @fluidframework/aqueduct

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

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
npm i @fluidframework/aqueduct
```

## Importing from this package

This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.
For more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

To access the `public` ([SemVer](https://semver.org/)) APIs, import via `@fluidframework/aqueduct` like normal.

To access the `legacy` APIs, import via `@fluidframework/aqueduct/legacy`.

## API Documentation

API documentation for **@fluidframework/aqueduct** is available at <https://fluidframework.com/docs/apis/aqueduct>.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

![Aqueduct](https://publicdomainvectors.org/photos/johnny-automatic-Roman-aqueducts.png)

The Aqueduct is a library for building Fluid objects and Fluid containers within the Fluid Framework. Its goal is to
provide a thin base layer over the existing Fluid Framework interfaces that allows developers to get started quickly.

## Fluid object development

Fluid object development consists of developing the data object and the corresponding data object factory. The data
object defines the logic of your Fluid object, whereas the data object factory defines how to initialize your object.

## Data object development

`DataObject` and `PureDataObject` are the two base classes provided by the library.

### DataObject

The [DataObject][] class extends [PureDataObject](#puredataobject) and provides the following additional functionality:

-   A `root` SharedDirectory that makes creating and storing distributed data structures and objects easy.
-   Blob storage implementation that makes it easier to store and retrieve blobs.

**Note:** Most developers will want to use the `DataObject` as their base class to extend.

### PureDataObject

[PureDataObject][] provides the following functionality:

-   Basic set of interface implementations to be loadable in a Fluid container.
-   Functions for managing the Fluid object lifecycle.
    -   `initializingFirstTime(props: S)` - called only the first time a Fluid object is initialized and only on the first
        client on which it loads.
    -   `initializingFromExisting()` - called every time except the first time a Fluid object is initialized; that is, every
        time an instance is loaded from a previously created instance.
    -   `hasInitialized()` - called every time after `initializingFirstTime` or `initializingFromExisting` executes
-   Helper functions for creating and getting other data objects in the same container.

**Note:** You probably don't want to inherit from this data object directly unless you are creating another base data
object class. If you have a data object that doesn't use distributed data structures you should use Container Services
to manage your object.

### DataObject example

In the below example we have a simple data object, _Clicker_, that will render a value alongside a button the the page.
Every time the button is pressed the value will increment. Because this data object renders to the DOM it also extends
`IFluidHTMLView`.

```jsx
export class Clicker extends DataObject implements IFluidHTMLView {
    public static get Name() { return "clicker"; }

    public get IFluidHTMLView() { return this; }

    private _counter: SharedCounter | undefined;

    protected async initializingFirstTime() {
        const counter = SharedCounter.create(this.runtime);
        this.root.set("clicks", counter.handle);
    }

    protected async hasInitialized() {
        const counterHandle = this.root.get<IFluidHandle<SharedCounter>>("clicks");
        this._counter = await counterHandle.get();
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <CounterReactView counter={this.counter} />,
            div,
        );
        return div;
    }

    private get counter() {
        if (this._counter === undefined) {
            throw new Error("SharedCounter not initialized");
        }
        return this._counter;
    }
}
```

## DataObjectFactory development

The `DataObjectFactory` is used to create a Fluid object and to initialize a data object within the context of a
Container. The factory can live alongside a data object or within a different package. The `DataObjectFactory` defines
the distributed data structures used within the data object as well as any Fluid objects it depends on.

The Aqueduct offers a factory for each of the data objects provided.

### More details

-   [DataObjectFactory][]
-   [PureDataObjectFactory][]

### DataObjectFactory example

In the below example we build a `DataObjectFactory` for the [Clicker](#dataobject-example) example above. To build a
`DataObjectFactory`, we need to provide factories for the distributed data structures we are using inside of our
`DataObject`. In the above example we store a handle to a `SharedCounter` in `this.root` to track our `"clicks"`. The
`DataObject` comes with the `SharedDirectory` (`this.root`) already initialized, so we just need to add the factory for
`SharedCounter`.

```typescript
export const ClickerInstantiationFactory = new DataObjectFactory(
	Clicker.Name,
	Clicker,
	[SharedCounter.getFactory()], // distributed data structures
	{}, // Provider Symbols see below
);
```

This factory can then create Clickers when provided a creating instance context.

```typescript
const myClicker = ClickerInstantiationFactory.createInstance(this.context) as Clicker;
```

### Providers in data objects

The `this.providers` object on `PureDataObject` is initialized in the constructor and is generated based on Providers
provided by the Container. To access a specific provider you need to:

1. Define the type in the generic on `PureDataObject`/`DataObject`
2. Add the symbol to your factory (see [DataObjectFactory Example](#dataobjectfactory-example) below)

In the below example we have an `IFluidUserInfo` interface that looks like this:

```typescript
interface IFluidUserInfo {
	readonly userCount: number;
}
```

On our example we want to declare that we want the `IFluidUserInfo` Provider and get the `userCount` if the Container
provides the `IFluidUserInfo` provider.

```typescript
export class MyExample extends DataObject<IFluidUserInfo> {
    protected async initializingFirstTime() {
        const userInfo = await this.providers.IFluidUserInfo;
        if(userInfo) {
            console.log(userInfo.userCount);
        }
    }
}

// Note: we have to define the symbol to the IFluidUserInfo that we declared above. This is compile time checked.
export const ClickerInstantiationFactory = new DataObjectFactory(
    Clicker.Name
    Clicker,
    [], // distributed data structures
    {IFluidUserInfo}, // Provider Symbols see below
);
```

## Container development

A Container is a collection of data objects and functionality that produce an experience. Containers hold the instances
of data objects as well as defining the data objects that can be created within the Container. Because of this data
objects cannot be consumed except for when they are within a Container.

The Aqueduct library provides the [ContainerRuntimeFactoryWithDefaultDataStore][] that enables you as a container
developer to:

-   Define the registry of data objects that can be created
-   Declare the default data object
-   Use provider entries
-   Declare Container level [Request Handlers](#container-level-request-handlers)

## Container object example

In the below example we will write a Container that exposes the above [Clicker](#dataobject-example) using the
[Clicker Factory](#dataobjectfactory-example). You will notice below that the Container developer defines the
registry name (data object type) of the Fluid object. We also pass in the type of data object we want to be the default.
The default data object is created the first time the Container is created.

```typescript
export fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
  ClickerInstantiationFactory.type, // Default data object type
  ClickerInstantiationFactory.registryEntry, // Fluid object registry
  [], // Provider Entries
  [], // Request Handler Routes
);
```

## Container-level request handlers

You can provide custom request handlers to the container. These request handlers are injected after system handlers but
before the `DataObject` get function. Request handlers allow you to intercept requests made to the container and return
custom responses.

Consider a scenario where you want to create a random color generator. I could create a RequestHandler that when someone
makes a request to the Container for `{url:"color"}` will intercept and return a custom `IResponse` of `{ status:200, type:"text/plain", value:"blue"}`.

We use custom handlers to build the Container Services pattern.

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
    -   Running Fluid in a Node.js environment with the `--no-experimental-fetch` flag is not supported.
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

<!-- Links -->

[containerruntimefactorywithdefaultdatastore]: https://github.com/microsoft/FluidFramework/blob/main/packages/framework/aqueduct/src/containerRuntimeFactories/containerRuntimeFactoryWithDefaultDataStore.ts
[dataobject]: https://github.com/microsoft/FluidFramework/blob/main/packages/framework/aqueduct/src/data-objects/dataObject.ts
[dataobjectfactory]: https://github.com/microsoft/FluidFramework/blob/main/packages/framework/aqueduct/src/data-object-factories/dataObjectFactory.ts
[puredataobject]: https://github.com/microsoft/FluidFramework/blob/main/packages/framework/aqueduct/src/data-object-factories/pureDataObject.ts
[puredataobjectfactory]: https://github.com/microsoft/FluidFramework/blob/main/packages/framework/aqueduct/src/data-object-factories/pureDataObjectFactory.ts

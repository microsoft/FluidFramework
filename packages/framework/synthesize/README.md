# @fluidframework/synthesize

An Ioc type library for synthesizing a FluidObject based on FluidObject providers.


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
npm i @fluidframework/synthesize
```

## Importing from this package

This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.
For more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

To access the `public` ([SemVer](https://semver.org/)) APIs, import via `@fluidframework/synthesize` like normal.

To access the `legacy` APIs, import via `@fluidframework/synthesize/legacy`.

## API Documentation

API documentation for **@fluidframework/synthesize** is available at <https://fluidframework.com/docs/apis/synthesize>.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

It allows for the creation of a `DependencyContainer` that can have FluidObjects registered with it
based on their interface Symbol. So for example if I wanted to register something as `IFoo` I would
need to provide and object that implements `IFoo` along side it.

The `DependencyContainer` also exposes a `synthesize` method that returns an object with a `Promise` to the
correct optional and required symbols requested.

So if I wanted an object with an optional `IFoo` and a required `IBar` I would get back:

```typescript
{
	IFoo: Promise<IFoo | undefined>;
	IBar: Promise<IBar>;
}
```

## Simple Example

```typescript
const dc = new DependencyContainer<FluidObject<IFoo & IBar>>();
dc.register(IFoo, new Foo());

const s = dc.synthesize({IFoo}, {});
const foo = await s.IFoo;
console.log(s.IFoo?.foo;)
```

# API

-   [Providers](##Providers)
    -   [`InstanceProvider`](###Instance-Provider)
    -   [`SingletonProvider`](###Singleton-Provider)
    -   [`ValueProvider`](###Value-Provider)
    -   [`FactoryProvider`](###Factory-Provider)
-   [Synthesize](##Synthesize)
    -   [Optional Types](###Optional-Types)
    -   [Required Types](###Required-Types)
    -   [Multiple Types](###Multiple-Types)
-   [Parent](##Parent)

## Fluid object Providers

Fluid object Providers are the the different ways you can return a FluidObject when registering.

There are four types of providers:

1. [`Value Provider`](###Value-Provider)
2. [`Async Value Provider`](###Async-Value-Provider)
3. [`Factory Provider`](###Factory-Provider)
4. [`Async Factory Provider`](###Async-Factory-Provider)

```typescript
type FluidObjectProvider<T> =
	| NonNullable<T>
	| Promise<NonNullable<T>>
	| ((dependencyContainer: IFluidDependencySynthesizer) => NonNullable<T>)
	| ((dependencyContainer: IFluidDependencySynthesizer) => Promise<NonNullable<T>>);
```

### Value Provider

Provide an FluidObject of a given type.

#### Usage

```typescript
const dc = new DependencyContainer<FluidObject<IFoo>>();

dc.register(IFoo, new Foo());
```

### Async Value Provider

Provide a Promise to an FluidObject of a given type.

#### Usage

```typescript
const dc = new DependencyContainer<FluidObject<IFoo>>();

const generateFoo: Promise<IFoo> = await() => {
    const foo = new Foo();
    await foo.initialize();
    return foo;
}

dc.register(IFoo, generateFoo());
```

### Factory Provider

Provide a function that will resolve an FluidObject of a given type.

#### Usage

```typescript
const dc = new DependencyContainer<FluidObject<IFoo & IBar>>();
const fooFactory = () => new Foo();
dc.register(IFoo, fooFactory);

// Factories can utilize the DependencyContainer if the FluidObject depends
// on other providers
const barFactory = (dc) => new Bar(dc);
dc.register(IFoo, barFactory);
```

### Async Factory Provider

Provide a function that will resolve a Promise to an FluidObject of a given type.

#### Usage

```typescript
const dc = new DependencyContainer<FluidObject<IFoo & IBar>>();

const generateFoo: Promise<IFoo> = await() => {
    const foo = new Foo();
    await foo.initialize();
    return foo;
}

dc.register(IFoo, generateFoo);

const generateBar: Promise<IBar> = await(dc) => {
    const bar = new Bar();
    await bar.initialize(dc);
    return bar;
}

dc.register(IBar, generateBar);
```

## Synthesize

Once you have a `DependencyContainer` with registered providers you can synthesize/generate a new FluidObject
from it. The object that is returned will have the correct typing of optional and required types.

An Example:

If I wanted an object with an optional `IFoo` and a required `IBar` I would get back:

```typescript
{
	IFoo: Promise<IFoo | undefined>;
	IBar: Promise<IBar>;
}
```

`synthesize` takes `optionalTypes` and `requiredTypes` as well as their corresponding types. `FluidObjectSymbolProvider<>`
is a TypeScript `type` that ensures the types being passed match the ones in the object being provided.

### Optional Types

Optional types will return a Promise to it's corresponding FluidObject or undefined. Because of this we need to do
an if check to validate the object or use the `?` like in the example below.

```typescript
const dc = new DependencyContainer<FluidObject<IFoo>>();

const s = dc.synthesize<IFoo>({ IFoo }, {});
const foo = await s.IFoo;
console.log(foo?.foo);
```

_Note: Because of how generics in TypeScript work we need to provide an empty `requiredTypes` object even though we don't
need to provide the type._

### Required Types

Required types will return a Promise to it's corresponding FluidObject or it will throw.

You can see below that we don't need to add the `?` to check our requested type.

```typescript
const dc = new DependencyContainer<FluidObject<IFoo>>();

const scope = dc.synthesize<{}, IFoo>({}, { IFoo });
const foo = await s.IFoo;
console.log(foo.foo);
```

### Multiple Types

You can declare multiple types for both Optional and Required using the `&` or creating a separate type.

```typescript
const dc = new DependencyContainer<FluidObject<IFoo & IBar>>();

const scope = dc.synthesize<IFoo & IBar>({ IFoo, IBar }, {});
const fooP = s.IFoo;
const barP = s.IBar;
const [foo, bar] = Promise.all([foo, bar]);
console.log(foo?.foo);
console.log(bar?.bar);
```

```typescript
const dc = new DependencyContainer<FluidObject<IFoo & IBar>>();

const scope = dc.synthesize<{}, IFoo & IBar>({}, { IFoo, IBar });
const fooP = s.IFoo;
const barP = s.IBar;
const [foo, bar] = Promise.all([foo, bar]);
console.log(foo.foo);
console.log(bar.bar);
```

```typescript
const dc = new DependencyContainer<FluidObject<IFoo & IBar>>();

const scope = dc.synthesize<IFoo, IBar>({ IFoo }, { IBar });
const fooP = s.IFoo;
const barP = s.IBar;
const [foo, bar] = Promise.all([foo, bar]);
console.log(foo?.foo);
console.log(bar.bar);
```

## Parent

The `DependencyContainer` takes one optional parameter which is the `parent`. When resolving providers the `DependencyContainer` will first
check the current container then look in the parent.

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

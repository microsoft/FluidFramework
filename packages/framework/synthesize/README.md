# @fluidframework/synthesize

An Ioc type library for synthesizing a FluidObject based on FluidObject providers.


<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

For a dependency on a Fluid Framework library's public APIs, we recommend a `^` (caret) version range.
For example, use `^1.3.4`.

For a dependency on an unstable API, such as a `beta` API, we recommend a more restrictive version range.
For example, use a `~` version range.

## Installation

Run this command to install the package:

```bash
npm i @fluidframework/synthesize
```

## Importing from this package

This package uses [package.json exports](https://nodejs.org/api/packages.html#exports) to separate APIs by support level.
For information about the support guarantees, read [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

Import the `public` ([Semantic Versioning (SemVer)](https://semver.org/)) APIs from `@fluidframework/synthesize`.

Import the `legacy` APIs from `@fluidframework/synthesize/legacy`.

## API Documentation

Read the **@fluidframework/synthesize** API documentation at <https://fluidframework.com/docs/apis/synthesize>.

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

Fluid Framework client libraries support the platforms in this document.
These requirements are intentionally restrictive.
Within a major version series, we can relax these requirements, but we cannot make them stricter.
For a Long Term Support (LTS) version, we might need to support these platforms for several years.

Other configurations can work, but Fluid Framework does not support them.
If an unsupported configuration stops working, we do not classify this as a bug.
To request support for a configuration that is not listed, file an issue.
The product team will evaluate your request.
In the issue, specify the current status of the configuration:

-   The configuration works but needs official support.
-   The configuration does not work and requires changes.

### Supported Runtimes

-   Fluid Framework supports Node.js versions 22 and 24 while they receive [upstream support](https://nodejs.org/en/about/previous-releases).
    -   Fluid Framework will stop support for version 22 [when upstream support ends on 2027-04-30](https://github.com/nodejs/release#release-schedule).
    -   Fluid Framework does not support Node.js with the `--no-experimental-fetch` flag.
-   Fluid Framework supports modern browsers that support the ES2022 standard library.

### Supported Tools

-   [TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0):
    -   Fluid Framework supports all [`strict`](https://www.typescriptlang.org/tsconfig) options.
    -   Set the build targets (`lib`, `target`) to `ES2022` or later.
    -   Enable [`strictNullChecks`](https://www.typescriptlang.org/tsconfig).
    -   Fluid Framework does not support [configuration options deprecated in TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0#breaking-changes-and-deprecations-in-typescript-6-0).
    -   Fluid Framework does not fully support `exactOptionalPropertyTypes`.
        If you enable this option, do not use `in`, `Reflect.has`, `Object.hasOwn`, or `Object.prototype.hasOwnProperty` to narrow members of Fluid Framework types.
        These methods can incorrectly exclude `undefined` from the possible values.
-   [webpack](https://webpack.js.org/) 5
    -   We do not require a specific bundler.
        Other bundlers that handle ES Modules can work, but we actively test only webpack.

### Module Resolution

In TypeScript `compilerOptions`, use [`Node16`, `Node20`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) module resolution.
These settings follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).

Do not use `Node10` module resolution.

### Module Formats

-   ES Modules:
    Use ES Modules to consume Fluid Framework client packages, including in Node.js.
-   CommonJS:
    Fluid Framework does not officially support CommonJS in version 3.0 or later.

## Contribution Guidelines

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

-   Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
-   Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [Fluid Framework wiki](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact [opencode@microsoft.com](mailto:opencode@microsoft.com).

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Read the [Fluid Framework documentation](https://fluidframework.com/docs/) for information about Fluid Framework concepts and APIs.

To request information that the documentation does not contain, [create an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

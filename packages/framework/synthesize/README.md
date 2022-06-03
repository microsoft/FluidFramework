# @fluidframework/synthesize

An Ioc type library for synthesizing a FluidObject based on FluidObject providers.

It allows for the creation of a `DependencyContainer` that can have FluidObjects registered with it
based on their interface Symbol. So for example if I wanted to register something as `IFoo` I would
need to provide and object that implements `IFoo` along side it.

The `DependencyContainer` also exposes a `synthesize` method that returns an object with a `Promise` to the
correct optional and required symbols requested.

So if I wanted an object with an optional `IFoo` and a required `IBar` I would get back:

```typescript
{
    IFoo: Promise<IFoo | undefined>
    IBar: Promise<IBar>
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

- [Providers](##Providers)
  - [`InstanceProvider`](###Instance-Provider)
  - [`SingletonProvider`](###Singleton-Provider)
  - [`ValueProvider`](###Value-Provider)
  - [`FactoryProvider`](###Factory-Provider)
- [Synthesize](##Synthesize)
  - [Optional Types](###Optional-Types)
  - [Required Types](###Required-Types)
  - [Multiple Types](###Multiple-Types)
- [Parent](##Parent)

## Fluid object Providers

Fluid object Providers are the the different ways you can return a FluidObject when registering.

There are four types of providers:

1. [`Value Provider`](###Value-Provider)
2. [`Async Value Provider`](###Async-Value-Provider)
3. [`Factory Provider`](###Factory-Provider)
4. [`Async Factory Provider`](###Async-Factory-Provider)

```typescript
type FluidObjectProvider<T> =
    NonNullable<T>
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
    IFoo: Promise<IFoo | undefined>
    IBar: Promise<IBar>
}
```

`synthesize` takes `optionalTypes` and `requiredTypes` as well as their corresponding types. `FluidObjectSymbolProvider<>`
is a TypeScript `type` that ensures the types being passed match the ones in the object being provided.

### Optional Types

Optional types will return a Promise to it's corresponding FluidObject  or undefined. Because of this we need to do
an if check to validate the object or use the `?` like in the example below.

```typescript
const dc = new DependencyContainer<FluidObject<IFoo>>();

const s = dc.synthesize<IFoo>({IFoo}, {});
const foo = await s.IFoo;
console.log(foo?.foo);
```

*Note: Because of how generics in TypeScript work we need to provide an empty `requiredTypes` object even though we don't
need to provide the type.*

### Required Types

Required types will return a Promise to it's corresponding FluidObject or it will throw.

You can see below that we don't need to add the `?` to check our requested type.

```typescript
const dc = new DependencyContainer<FluidObject<IFoo>>();

const scope = dc.synthesize<{}, IFoo>({}, {IFoo});
const foo = await s.IFoo;
console.log(foo.foo);
```

### Multiple Types

You can declare multiple types for both Optional and Required using the `&` or creating a separate type.

```typescript
const dc = new DependencyContainer<FluidObject<IFoo & IBar>>();

const scope = dc.synthesize<IFoo & IBar>({IFoo, IBar}, {});
const fooP = s.IFoo;
const barP = s.IBar;
const [foo, bar] = Promise.all([foo, bar]);
console.log(foo?.foo);
console.log(bar?.bar);
```

```typescript
const dc = new DependencyContainer<FluidObject<IFoo & IBar>>();

const scope = dc.synthesize<{}, IFoo & IBar>({}, {IFoo, IBar});
const fooP = s.IFoo;
const barP = s.IBar;
const [foo, bar] = Promise.all([foo, bar]);
console.log(foo.foo);
console.log(bar.bar);
```

```typescript
const dc = new DependencyContainer<FluidObject<IFoo & IBar>>();

const scope = dc.synthesize<IFoo, IBar>({IFoo}, {IBar});
const fooP = s.IFoo;
const barP = s.IBar;
const [foo, bar] = Promise.all([foo, bar]);
console.log(foo?.foo);
console.log(bar.bar);
```

## Parent

The `DependencyContainer` takes one optional parameter which is the `parent`. When resolving providers the `DependencyContainer` will first
check the current container then look in the parent.


# Fluid Synthesize

An Ioc type library for synthesizing a fluid IComponent object based on registered IComponent providers.

It allows for the creation of a `DependencyContainer` that can have IComponent objects registered with it
based on their interface Symbol. So for example if I wanted to register something as `IComponentFoo` I would
need to provide and object that implements `IComponentFoo` along side it.

The `DependencyContainer` also exposes a `synthesize` method that returns an object with a `Promise` to the
correct optional and required symbols requested.

So if I wanted an object with an optional `IComponentFoo` and a required `IComponentBar` I would get back:

```typescript
{
    IComponentFoo: Promise<IComponentFoo | undefined>
    IComponentBar: Promise<IComponentBar>
}
```

## Simple Example

```typescript
const dc = new DependencyContainer();
dc.register(IComponentFoo, new Foo());

const s = dc.synthesize({IComponentFoo}, {});
const foo = await s.IComponentFoo;
console.log(s.IComponentFoo?.foo;)
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

## Component Providers

Component Providers are the the different ways you can return a Component when registering.  

There are four types of providers:

1. [`Value Provider`](###Value-Provider)
2. [`Async Value Provider`](###Async-Value-Provider)
3. [`Factory Provider`](###Factory-Provider)
4. [`Async Factory Provider`](###Async-Factory-Provider)

```typescript
type ComponentProvider<T extends keyof IComponent> =
    IComponent[T]
    | Promise<IComponent[T]>
    | ((dependencyContainer: DependencyContainer) => IComponent[T])
    | ((dependencyContainer: DependencyContainer) => Promise<IComponent[T]>);
```

### Value Provider

Provide an IComponent of a given type.

#### Usage

```typescript
const dc = new DependencyContainer();

// Singleton
const foo = new Foo();
dc.register(IComponentFoo, Foo);

// Instance
dc.register(IComponentFoo, new Foo())
```

### Async Value Provider

Provide a Promise to an IComponent of a given type.

#### Usage

```typescript
const dc = new DependencyContainer();

const generateFoo: Promise<IComponentFoo> = await() => {
    const foo = new Foo();
    await foo.initialize();
    return foo;
}

// Singleton
const foo = generateFoo();
dc.register(IComponentFoo, foo);

// Instance
dc.register(IComponentFoo, generateFoo());
```

### Factory Provider

```typescript
(dependencyContainer: DependencyContainer) => IComponent[T]
```

Provide a function that will resolve an IComponent object of a given type.

#### Usage

```typescript
const dc = new DependencyContainer();
const fooFactory = () => new Foo();
dc.register(IComponentFoo, fooFactory);

// Factories can utilize the DependencyContainer if the IComponent object depends
// on other providers
const barFactory = (dc) => new Bar(dc);
dc.register(IComponentBar, barFactory);
```

### Async Factory Provider

```typescript
(dependencyContainer: DependencyContainer) => Promise<IComponent[T]>
```

Provide a function that will resolve a Promise to an IComponent object of a given type.

#### Usage

```typescript
const dc = new DependencyContainer();

const generateFoo: Promise<IComponentFoo> = await() => {
    const foo = new Foo();
    await foo.initialize();
    return foo;
}

dc.register(IComponentFoo, generateFoo);

const generateBar: Promise<IComponentBar> = await(dc) => {
    const bar = new Bar();
    await bar.initialize(dc);
    return bar;
}

dc.register(IComponentBar, generateBar);
```

## Synthesize

Once you have a `DependencyContainer` with registered providers you can synthesize/generate a new IComponent object from it. The
object that is returned will have the correct typing of optional and required types.

An Example:

If I wanted an object with an optional `IComponentFoo` and a required `IComponentBar` I would get back:

```typescript
{
    IComponentFoo: Promise<IComponentFoo | undefined>
    IComponentBar: Promise<IComponentBar>
}
```

`synthesize` takes `optionalTypes` and `requiredTypes` as well as their corresponding types. `ComponentSymbolProvider<>`
is a TypeScript `type` that ensures the types being passed match the ones in the object being provided.

### Optional Types

Optional types will return a Promise to it's corresponding IComponent object or undefined. Because of this we need to do an if check to validate the object or use the `?` like in the example below.

```typescript
const dc = new DependencyContainer();

const s = dc.synthesize({IComponentFoo}, {});
const foo = await s.IComponentFoo;
console.log(foo?.foo);
```

*Note: Because of how generics in TypeScript work we need to provide an empty `requiredTypes` object even though we don't
need to provide the type.*

### Required Types

Required types will return a Promise to it's corresponding IComponent object or it will throw.

You can see below that we don't need to add the `?` to check our requested type.

```typescript
const dc = new DependencyContainer();

const scope = dc.synthesize({}, {IComponentFoo});
const foo = await s.IComponentFoo;
console.log(foo.foo);
```

### Multiple Types

You can declare multiple types for both Optional and Required using the `&` or creating a separate type.

```typescript
const dc = new DependencyContainer();

const scope = dc.synthesize({IComponentFoo, IComponentBar}, {});
const fooP = s.IComponentFoo;
const barP = s.IComponentBar;
const [foo, bar] = Promise.all([foo, bar]);
console.log(foo?.foo);
console.log(bar?.bar);
```

```typescript
const dc = new DependencyContainer();

const scope = dc.synthesize({}, {IComponentFoo, IComponentBar});
const fooP = s.IComponentFoo;
const barP = s.IComponentBar;
const [foo, bar] = Promise.all([foo, bar]);
console.log(foo.foo);
console.log(bar.bar);
```

```typescript
const dc = new DependencyContainer();

const scope = dc.synthesize({IComponentFoo}, {IComponentBar});
const fooP = s.IComponentFoo;
const barP = s.IComponentBar;
const [foo, bar] = Promise.all([foo, bar]);
console.log(foo?.foo);
console.log(bar.bar);
```

## Parent

The `DependencyContainer` takes one optional parameter which is the `parent`. When resolving providers the `DependencyContainer` will first
check the current container then look in the parent.

The `parent` can also be set after `DependencyContainer` creation.

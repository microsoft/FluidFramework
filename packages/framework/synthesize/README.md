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

const s = dc.synthesize<IComponentFoo>({IComponentFoo}, {});
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

```typescript
type ComponentProvider<T extends keyof IComponent> =
    IComponent[T]
    | Promise<IComponent[T]>
    | ((dependencyContainer: DependencyContainer) => IComponent[T])
    | ((dependencyContainer: DependencyContainer) => Promise<IComponent[T]>);
```

There are four types of providers

1. [`Value Provider`](###Instance-Provider)
2. [`Async Value Provider`](###Singleton-Provider)
3. [`Factory Provider`](###Value-Provider)
4. [`Async Factory Provider`](###Factory-Provider)

### Value Provider

```typescript
interface InstanceProvider<T extends IComponent> {
    instance: new () => T;
    lazy?: boolean;
}
```

Provide a parameterless class constructor and a new instance will be created every time a `Scope` is synthesized.

`lazy` defaults to true if not provide. The instance will be created the first time someone requests it and not when
the `Scope` is synthesized.

#### Usage

```typescript
const dc = new DependencyContainer();
dc.register(IComponentFoo, {instance: Foo});

// register instance with lazy loading disabled
dc.register(IComponentFoo, {instance: Foo, lazy: false});
```

### Singleton Provider

```typescript
interface SingletonProvider<T extends IComponent> {
    singleton: new () => T;
    lazy?: boolean;
}
```

Provide a parameterless class constructor and a single instance will be created and used for all `Scope` objects synthesized.

`lazy` defaults to true if not provide. The singleton will be created the first time anyone requests it from the `DependencyContainer` and not
when a `Scope` is synthesized.

#### Usage

```typescript
const dc = new DependencyContainer();
dc.register(IComponentFoo, {singleton: Foo});

// register singleton with lazy loading disabled
dc.register(IComponentFoo, {singleton: Foo, lazy: false});
```

### Value Provider

```typescript
interface ValueProvider<T extends IComponent> {
    value: ComponentProvider<T>;
}
```

Provide any existing object. Used if your object takes parameters.

#### Usage

```typescript
const dc = new DependencyContainer();
const foo = new Foo("bar");

dc.register(IComponentFoo, {value: foo});
```

### Factory Provider

```typescript
interface FactoryProvider<T extends IComponent> {
    factory: (synthesizer: IComponentSynthesizer) => ComponentProvider<T>;
}
```

Dynamically generate the object you want to return. Provides the current synthesizer if the factory
wants to use it to generate the Provider.

#### Usage

```typescript
const dc = new DependencyContainer();
const fooFactory = (dc) => new Foo("bar", dc);

dc.register(IComponentFoo, {factory: fooFactory});
```

## Synthesize

Once you have a `DependencyContainer` with registered providers you can synthesize/generate a new IComponent object from it. The
object that is returned is called a `Scope` and will have the correct typing of optional and required types.

`synthesize` takes `optionalTypes` and `requiredTypes` as well as their corresponding types. `ComponentSymbolProvider<>`
is a TypeScript `type` that ensures the types being passed match the ones in the object being provided.

```typescript
class synthesize<O extends IComponent, R extends IComponent>(
        optionalTypes: ComponentSymbolProvider<O>,
        requiredTypes: ComponentSymbolProvider<R>,
    ): Scope<O, R> { ... }
```

### Optional Types

Optional types will return an object that will have your requested type as a property but may have an
`undefined` backing it. Because of this we need to do an if check to validate the object or use the `?` like
in the example below.

```typescript
const dc = new DependencyContainer();

const scope = dc.synthesize<IComponentFoo>({IComponentFoo}, {});

console.log(scope.IComponentFoo?.foo);
```

*Note: Because of how generics in TypeScript work we need to provide an empty `requiredTypes` object even though we don't
need to provide the type.*

### Required Types

Required types will return and object that will have your request type as a property or it will throw creating the Scope.

You can see below that we don't need to add the `?` to check our requested type.

```typescript
const dc = new DependencyContainer();

const scope = dc.synthesize<{}, IComponentFoo>({}, {IComponentFoo});

console.log(scope.IComponentFoo.foo);
```

### Multiple Types

You can declare multiple types for both Optional and Required using the `&` or creating a separate type.

```typescript
const dc = new DependencyContainer();

const scope = dc.synthesize<IComponentFoo & IComponentBar>({IComponentFoo, IComponentBar}, {});

console.log(scope.IComponentFoo?.foo);
console.log(scope.IComponentBar?.bar);
```

```typescript
type MyAwesomeOptionalType = IComponentFoo & IComponentBar;

// ...

const dc = new DependencyContainer();

const scope = dc.synthesize<{}, MyAwesomeOptionalType>({}, {IComponentFoo, IComponentBar});

console.log(scope.IComponentFoo.foo);
console.log(scope.IComponentBar.bar);
```

## Parent

The `DependencyContainer` takes one optional parameter which is the `parent`. When resolving providers the `DependencyContainer` will first
check the current the look in the parent.

The `parent` can also be set after `DependencyContainer` creation.

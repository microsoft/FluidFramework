# Fluid Synthesize

An Ioc type library for synthesizing a fluid IComponent object based on registered providers.

It allows for the creation of a `Vessel` (Container) that can have providers registered with. It exposes a `synthesize` method
that will return an object with the correct optional and required types requested.

The returned object is defined as a `Scope` and uses the `IProvideComponent` paradigm to expose the requested types.

## Simple Example

```typescript
const vessel = new Vessel();
const foo = new Foo();
vessel.register(IComponentFoo, {value: foo});

const s = vessel.synthesize<IComponentFoo>({IComponentFoo}, {});

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

## Providers

There are four types of providers

1. [`InstanceProvider`](###Instance-Provider)
2. [`SingletonProvider`](###Singleton-Provider)
3. [`ValueProvider`](###Value-Provider)
4. [`FactoryProvider`](###Factory-Provider)

### Instance Provider

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
const vessel = new Vessel();
vessel.register(IComponentFoo, {instance: Foo});

// register instance with lazy loading disabled
vessel.register(IComponentFoo, {instance: Foo, lazy: false});
```

### Singleton Provider

```typescript
interface SingletonProvider<T extends IComponent> {
    singleton: new () => T;
    lazy?: boolean;
}
```

Provide a parameterless class constructor and a single instance will be created and used for all `Scope` objects synthesized.

`lazy` defaults to true if not provide. The singleton will be created the first time anyone requests it from the `Vessel` and not
when a `Scope` is synthesized.

#### Usage

```typescript
const vessel = new Vessel();
vessel.register(IComponentFoo, {singleton: Foo});

// register singleton with lazy loading disabled
vessel.register(IComponentFoo, {singleton: Foo, lazy: false});
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
const vessel = new Vessel();
const foo = new Foo("bar");

vessel.register(IComponentFoo, {value: foo});
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
const vessel = new Vessel();
const fooFactory = (vessel) => new Foo("bar", vessel);

vessel.register(IComponentFoo, {factory: fooFactory});
```

## Synthesize

Once you have a `Vessel` with registered providers you can synthesize/generate a new IComponent object from it. The
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
const vessel = new Vessel();

const scope = vessel.synthesize<IComponentFoo>({IComponentFoo}, {});

console.log(scope.IComponentFoo?.foo);
```

*Note: Because of how generics in TypeScript work we need to provide an empty `requiredTypes` object even though we don't
need to provide the type.*

### Required Types

Required types will return and object that will have your request type as a property or it will throw creating the Scope.

You can see below that we don't need to add the `?` to check our requested type.

```typescript
const vessel = new Vessel();

const scope = vessel.synthesize<{}, IComponentFoo>({}, {IComponentFoo});

console.log(scope.IComponentFoo.foo);
```

### Multiple Types

You can declare multiple types for both Optional and Required using the `&` or creating a separate type.

```typescript
const vessel = new Vessel();

const scope = vessel.synthesize<IComponentFoo & IComponentBar>({IComponentFoo, IComponentBar}, {});

console.log(scope.IComponentFoo?.foo);
console.log(scope.IComponentBar?.bar);
```

```typescript
type MyAwesomeOptionalType = IComponentFoo & IComponentBar;

// ...

const vessel = new Vessel();

const scope = vessel.synthesize<{}, MyAwesomeOptionalType>({}, {IComponentFoo, IComponentBar});

console.log(scope.IComponentFoo.foo);
console.log(scope.IComponentBar.bar);
```

## Parent

The `Vessel` takes one optional parameter which is the `parent`. When resolving providers the `Vessel` will first
check the current the look in the parent.

The `parent` can also be set after `Vessel` creation.
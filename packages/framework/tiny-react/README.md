# @fluidframework/tiny-react

**Tiny React** is an experimental light weight framework for building Fluid Components with React Hooks. The goal of this
framework is to bridge the gap for React developers coming into fluid.

## Hello World Example

This is a simple example of a Fluid component using tiny-react.

```jsx
export function HelloWorld() {
    const [value, setValue] = useFluidState("hw-key", "hello");
    const handleClick = () => setValue(value === "hello" ? "world" : "hello");
    return <button onClick={handleClick}>{value}</button>;
}

export const fluidExport = fluidReactComponentFactory("hello-world-example", <HelloWorld />);
```

## Consuming tiny-react

### useFluidState

```typescript
const [state, setState] = useFluidState("some-unique-key", 1);
```

`useFluidState` is a hook that acts similarly to React's native [`useState`](https://reactjs.org/docs/hooks-reference.html#usestate).
The only difference is that it takes a `key`. Because Fluid state is persisted we need a static identifier across
instances to ensure we are referencing the same Fluid map value. This key is used as that identifier.

When `useFluidState` is used outside of an established `FluidContext` it will default to using `useState`. This allows
you to build re-useable hooks that are not just useable within the scope of Fluid components.

### useFluidReducer

```typescript
const reducer = (state, action) => {...}
const [value, dispatch] = useFluidReducer("some-unique-key", reducer, { count: 1 });
```

`useFluidReducer` is a hook that acts similarly to React's native [`useReducer`](https://reactjs.org/docs/hooks-reference.html#usereducer).
The only difference is that it takes a `key`. Because Fluid state is persisted we need a static identifier across
instances to ensure we are referencing the same Fluid map value. This key is used as that identifier.

When `useFluidReducer` is used outside of an established `FluidContext` it will default to using `useReducer`. This allows
you to build re-useable hooks that are not just useable within the scope of Fluid components.

### createTinyFluidReactComponentFactory

```typescript
const factory = createTinyFluidReactComponentFactory("some-unique-component-name", <MyFluidElement />)
```

`createTinyFluidReactComponentFactory` is a helper function that creates a Fluid `IComponentFactory`. It takes a unique
component name and a `JSX.Element`. The element passed in is completely wrapped by one `FluidContext` that exposes one
Fluid `SharedDirectory`. This means that any `keys` passed into `useFluidState` or `useFluidReducer` will conflict.

This is powerful because it allows you to share state across elements via reference to the same key but it can also
cause problems if you have non-unique keys that are overwriting data.

## Advanced Concepts

### FluidContext

`FluidContext` is a React Context that can be initialized with fluid state.

`createTinyFluidReactComponentFactory` uses this to setup a Fluid Component with the `FluidContext.Provider` wrapping
the provided `JSX.Element`. The `FluidContext`, along with the hooks, can be used outside of the default factory implementation.

### generateUseFluidState

helper function that will generate the correct `useFluidState` hook given an `ISharedDirectory`. Should only be used if
you're implementing your own `FluidContext`.

### generateUseFluidReducer

helper function that will generate the correct `useFluidReducer` hook given an `ISharedDirectory`. Should only be used if
you're implementing your own `FluidContext`.

# Coding Guidelines

Coding guidelines for the Fluid Framework take a couple of forms.
Where possible, we enforce these rules in an automated fashion via tooling like our shared [build configurations](../../../common/build/build-common/README.md) and shared [ESLint configuration](../../../common/build/eslint-config-fluid).

Where guidelines cannot be enforced by tooling, please refer to the following guidelines.
And when in doubt, or when explicit guidance is not offered here, refer to [TypeScript's own guidelines](https://github.com/Microsoft/TypeScript/wiki/Coding-guidelines).

## Framework API Guidelines

The following are guidelines for crafting framework APIs that are likely to be well-received by TypeScript and JavaScript application developers.
The purpose of this document is to accelerate the API design and review process by helping framework engineers build a common understanding of the needs of the typical frontend developer.

The primary audience for this document is engineers and PMs designing client-side framework APIs that may interoperate with other modern frontend technologies.
It assumes the framework targets Evergreen Browsers and Progressive Web Applications (PWAs).
This document does not consider limitations of older browsers or the differing conventions of alternative environments like Node.js and React Native.

This document is intended to complement a healthy API design and review process.
It is not a substitute for customer profiling, scenario-driven design or customer feedback.
However, the reality is often that the budget for user research is limited, and it can be challenging to get users to evaluate alpha and beta releases.

As a result, it is often only late in the development cycle that framework engineers begin to get a trickle of feedback regarding their API choices.
Adopting the guidelines in this document will help avoid wasting this trickle addressing predictable ergonomics issues.
Additionally, adopting common API patterns makes our framework more accessible to both external and internal developers.

## Status

We are now putting these guidelines into practice in the Fluid Framework codebase, while at the same time continuing to grow this document based on feedback and specific cases encountered in the product.

## Pitfalls

### Designing For Yourself

A common pitfall for framework engineers is to assume that their preferences accurately mirror the needs of their end user.
The optimal balance of perfection vs. rapid release vs. overall engineering cost is different for frameworks and applications.
Consequently, framework engineers often mis-calibrate when it comes to API tradeoffs such as:

- flexible vs. simple
- elegant vs. obvious
- strict vs. agile
- general vs. familiar
- explicit vs. concise
- high-control vs. low-friction

If the qualities listed on the left resonate most strongly with you, you’re likely a framework engineer.
One technique for counter-balancing the natural tendency to over-engineer is to recognize that most user requests begin in the form “I just want X so I can Y."

### Fixation on Potential User Error

A common pitfall that framework engineers fall into is requiring the end user to jump through unnecessary hoops for the sake of user education.
Most engineers understand that a learning curve implies that users will not initially be experts.
However, it is often overlooked that this implies that users must be allowed to use the framework without fully understanding what they are doing.
This includes allowing the user to use the framework in suboptimal ways.

For example, a framework engineer might argue that `Array.indexOf` has a non-obvious `O(n)` cost.
They might argue that it’s better to omit this convenience as to encourage users to think carefully about alternatives (binary search, a more suitable data structure, etc.) as they hand code a for-loop.

What this argument fails to consider is that even if suboptimal, users find `indexOf` to be convenient and the results are often “good enough” for the user’s scenario.
When considering forbidding common practices (such as linear search or using strings to represent UUIDs), think carefully about whether the user is likely to understand the motivation for the friction and agree that the loss of convenience is justified by the potential for error.

## Guidance

### General

#### ✔ DO play well with others

The most successful technologies are those that can be adopted incrementally, are reasonable to retrofit into existing architectures, and build on familiar patterns and concepts.

Front-end developers prefer frameworks that interoperate via plain data and callbacks as opposed to formal contracts.
Even for [greenfield projects](https://en.wikipedia.org/wiki/Greenfield_project), developers (and companies) are averse to tying themselves foundationally to a specific technology, architecture, or pattern.

#### ✘ AVOID terminology, patterns, or concepts that require explanation

Clever patterns and elegant generalizations initially have negative value if they need to be explained.
To be net positive, the return on investment of learning a new pattern or concept needs to be immediate and obvious to the end user.

Remember that a frontend developer's attention is divided among the dozens of packages they are weaving together to ship a product.
Their goal is to learn "just enough" about your framework to understand if it solves their current problem.

#### ✔ DO align with JavaScript and DOM APIs

When crafting a new API, look to the standard built-in types and DOM for inspiration, as these are ubiquitous and likely familiar to your user.
You should give more weight to recent API additions as these better reflect modern practices.

#### ✔ DO provide reasonable default behaviors for boundary cases

Avoid throwing runtime errors when there is a reasonable and "obvious" default behavior.
This is especially true if there is precedent in the standard built-in types or DOM.

The JavaScript ecosystem relies on developers to provide snippets of glue code to connect packages authored by different parties.
This is how JavaScript achieves a high degree of code reuse without requiring prearranged contracts.

Developers expect this glue code to be concise and do not appreciate being required to anticipate, check for, and explicitly handle boundary conditions.
It is rare that a front-end developer complains about an API “swallowing errors” and generally views helpful coercion as part of the framework’s value.

```typescript
// Not an error: non-existent items in requested slice are elided
[].slice(0, 10); // -> []
// Not an error: slicing zero items returns an empty array
[0, 1, 2, 3].slice(0, 0); // -> []
```

Any default behavior(s) should be clearly documented in the API's source-code documentation.

#### ✘ AVOID exposing advanced or complex types

With each release, the TypeScript type system becomes more expressive, and we should leverage the capabilities of the type system to enhance developer productivity with accurate IntelliSense and helpful compiler errors.

However, it is important to remember that the purpose of TypeScript type checking in public APIs is to be helpful to the end developer.
“Being helpful” is slightly different than “enforcing correctness”.
Typing that creates friction, clutters imports, or degrades readability in IntelliSense or compiler errors is not perceived by developers as helpful, even if it is strictly “more correct”.

This is simple:

```typescript
from<T>(array: ArrayLike<T>): T[];
```

This is a little advanced, but still okay:

```typescript
from<T, U>(array: ArrayLike<T>, mapFn: (v: T, k: number) => U, thisArg?: any): U[];
```

This complex/advanced and probably shouldn't appear in a user-facing API:

```typescript
type CopyablePrimitives = null | boolean | number | string

type Copyable<T> = T extends CopyablePrimitives | { [brand]: "Copyable<T>" } ?
    T : never;

type Copied<T> = T extends CopyablePrimitives | { [brand]: "Copied<T>" };

from<TType, TIn extends Copyable<TType>, TOut extends Copied<TType>>(
    array: ArrayLike<TIn>,
    mapFn: (v: TIn, k: number): {
        action: "skip" | "stop"
    } | {
        action: "continue"
        value: TOut
    }, thisArg?: any): TOut[];
```

#### ✘ AVOID unnecessary use of generics

Generic parameters are one of the most common sources of the "advanced" or "complex" types cautioned against just above.
In general, generics should be used with prudence and only if they truly serve a purpose that can't be accomplished another way.

Here is an example of an appropriate use of a generic parameter:

```typescript
/** Add a label to an object */
function label<T extends object>(obj: T, label: string): T & { label: string } {
	Object.defineProperty(obj, label, { value: label });
	return obj as T & { label: string };
}
```

In this case, the function _receives_ an object of an unknown type from the user and also _returns_ that object back to the user.
This is a proper use of generics - to preserve output types from input types.
The same applies to class members.

Here is an example of an unnecessary use of a generic parameter:

```typescript
/** Returns true if and only if the given object has a label */
function hasLabel<T extends object>(obj: T): boolean {
	return (obj as { label?: string }).label !== undefined;
}
```

The generic type `T` is _only_ used as an input type - the type that it captures is never re-used later as output.
Therefore, the function can be written equivalently as follows:

```typescript
/** Returns true if and only if the given object has a label */
function hasLabel(obj: object): boolean {
	return (obj as { label?: string }).label !== undefined;
}
```

Always double check that each generic parameter you introduce has a meaningful and distinct purpose that can't be accomplished any other way.

#### ✔ DO use function overloading

Because [function overloading](https://www.typescriptlang.org/docs/handbook/2/functions.html#function-overloads) is inconvenient to implement in the JavaScript language, framework engineers often avoid it.
However, overloading is a powerful tool for reducing IntelliSense clutter and helping developers discover alternative ways to express the same operation.

### Naming

#### ✔ DO follow the style conventions used in the TypeScript documentation

This document is not intended to be a style guide, but when questions of style arise, the style used by examples in The TypeScript Handbook is a good representation of the prevailing conventions used by TypeScript developers:

- Use `PascalCase` for type names.
- Use `PascalCase` for enum values.
- Use `camelCase` for function, property, and variable names.

#### ✘ DO NOT prefix interfaces with `I`

While a common convention in some codebases, this naming convention has a few notable downsides:

- `interface`s and `type`s are often used interchangeably, and changing an existing entity between the two is common in refactoring.
  Renaming an item each time its underlying kind changes is needlessly disruptive.
- `I` prefixing encourages naming an interface for its implementation, rather than deriving implementation names from their semantic contracts (i.e., interfaces).

When introducing an interface with a single implementation (e.g., to hide implementation details from an API), prefer prefixing/postfixing the implementation rather than prefixing the interface. E.g.,

Prefer...

```typescript
export interface Foo {...}

class DefaultFoo implements Foo {...}
```

instead of...

```typescript
export interface IFoo {...}

class Foo implements IFoo {...}
```

This allows the public thing (the interface) to have the nice semantic name, and the private implementation detail is burdened with the more nuanced naming.

#### ✔ DO name type parameters when non-trivial

In general, give type parameters full names, rather than just typing T.
E.g., prefer `TFoo` to `T`.

In trivial cases, or when the type parameter is simply passed through to another type, `T` by itself is allowed.
E.g.

```typescript
// It's clear from context that the type here corresponds to the elements of the array.
// Using `TElement` isn't necessary.
export function sort<T>(input: T[]);
```

But in general, if you can provide useful semantics in a type name, you should.

And remember to document the parameters using a [@typeParam](./Documentation-Guidelines/Documenting-TypeScript/TSDoc-Guidelines.md#typeparam) TSDoc comment block.

#### ✔ DO prefix type parameters with T

The `T` prefix is industry-standard and is helpful in allowing developers to easily differentiate type parameters from other types at-a-glance.

Prefer...

```typescript
type SpecialMap<TKey, TValue> = ...
```

instead of...

```typescript
type SpecialMap<K, V> = ...
```

or...

```typescript
type SpecialMap<Key, Value> = ...
```

#### ✔ DO name functions using verb phrases

Naming functions, methods, callbacks, etc. using verb phrases helps to differentiate semantic objects from semantic actions at-a-glance.
E.g., prefer `createFoo()` over `foo()`.

#### ✔ DO optimize discoverability in IntelliSense

Think hard about the first word people will try typing in the code editor when they explore the feature area.
Try to make the first response in IntelliSense the correct entry point to the corresponding feature.

#### ✘ AVOID using abbreviations

Abbreviations can create ambiguity and can prove to be an accessibility issue.
Prefer complete English terms except for _very_ common abbreviations.

E.g. prefer "column" over "col", "current" over "cur", "if and only if" over "iff", etc.

Remember to think in terms of accessibility.

- Would a someone who is not a native English speaker understand the abbreviation?
- Would someone outside of Microsoft understand it?

Examples of common abbreviations that are appropriate for use include "HTML", "JSON", etc.

#### ✔ DO use concise names for frequently used APIs

Favor short and memorable names over longSelfDocumentingNames for important and frequently used APIs.
In the JavaScript community, developers assume the shorter the name the more important the API.
Long multi-word names are assumed to be rarely used or semi-internal.

- Remember to document any aspects that are not captured by the short name in the API documentation!

A good example is EventEmitter’s `on()` and `off()` pattern, which has largely become the de-facto standard among frameworks.
An anti-example is the DOM’s built-in `addEventListener()` and `removeEventListener()`, which frameworks rarely emulate.

Another anti-pattern is function/property names that unnecessarily echo return types or argument types/names.
For example, prefer `insert(item: Node)` to `insertItem(itemNode: Node)`.

#### ✔ DO use well-known prefixes/suffixes

Examples:

| Prefix  | Examples                           | Meaning                                                                                                                                                                                                                                                                   |
| ------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| as      | asNode                             | Casts the subject to a different interface, preforming a type check if necessary. Differs from 'to' in that no data is copied. The returned object is a different facet of the original.                                                                                  |
| Default | DefaultRuntime                     | Designates the built-in/commonly used implementation of an interface.                                                                                                                                                                                                     |
| is/has  | isObject, isConnected, hasChildren | Returns a Boolean indicating if the subject is an instance of a type, implements an interface, or is currently in specific state. Prefer 'is' except when unnatural. For example, prefer 'isConnected' to 'hasConnection' and prefer 'isInitialized' to 'hasInitialized'. |
| to      | Object.toString()                  | Constructs a new instance from the given argument(s) via a shallow or deep copy (contrast with ‘as’). Same as ‘from’, but resides as a static method on the type being constructed.                                                                                       |
| from    | Array.from()                       | Constructs a new instance from the given argument(s) via a shallow or deep copy (contrast with ‘as’). Similar to a constructor, but implies a conversion of one type to another. Same as ‘to’, but resides as a static method on the type being constructed.              |

### Modules

#### ✔ DO minimize the number of required packages

There are many boundaries along which a framework engineer might partition packages: layering, ownership, release group, etc.
All of these are generally for the convenience of the framework engineer, not the end user.
When publishing for the end user, the ideal number of packages is usually one.

There are a couple of exceptions:

Either-or scenarios where an application will import 1 of n packages.

Examples include:

- Choosing between a production or development version of the framework
- Choosing between React or Svelt interoperability
- Choosing between Azure or Syntex as a backend

Packages that are versioned separately for the end user’s convenience.

For example, `eslint` is versioned independently from its various plugins.
This helps to clearly differentiate architectural changes from content (i.e., rules) changes that might affect the user.

Note that if the incentive for partitioning into multiple packages is bundle size or IntelliSense clutter, you probably have a different problem.

### Data

#### ✔ PREFER data transparency

The JavaScript ecosystem interoperates primarily through trees of plain data.
Encapsulating data within an opaque object model creates friction when interfacing with 3rd party packages.
When possible, favor consuming and produce trees of JSON-compatible types.

#### ✔ DO express data as a tree of JSON-compatible types

To interoperate with existing backend and frontend technologies, data contracts should be defined using [JSON-compatible types](https://en.wikipedia.org/wiki/JSON#Data_types).
These are:

- Plain objects (no prototypes, string keys only, single reference)
- Dense arrays using keys 0..length-1 (no buffers, views, or typed arrays)
- Strings (valid Unicode only)
- Finite Float64 numbers (no Infinity, NaN, -0, or BigInt)
  \*Booleans
- Implicit undefined (optional properties elided by JSON serialization)
- Null (as empty root or placeholder in arrays – see next guideline.)

This subset of JavaScript types forms a minimal but complete data model that is well supported across data stores and transport protocols.

[GraphQL](https://graphql.org/) is a good example of a framework that embraces JSON as the “lowest common denominator”.
It's worth studying if you’re interested in applying this principle in a cross-language environment.

#### ✔ PREFER `undefined` over `null`

`undefined` is the preferred type for uninitialized variables, missing keys, or a sentinel representing an empty state.
Optional properties and arguments, which are implicitly `undefined`, are generally preferred over explicit `undefined`.

There are, however, a few cases where `null` continues to be appropriate.
The primary use case is JSON serializable data where "implicit undefined" is not an option.
These are:

- The root of an empty tree ("null”)
- An empty placeholder in arrays ("[null, 3]")

#### ✔ AVOID distinguishing between implicit and explicit undefined values

In the JavaScript language it is possible to distinguish between a non-existing property and a property that has been explicitly set to the `undefined` value.
You should interpret these identically when reading.

Do not go out of your way elide explicit `undefine`s, except in cases where it improves efficiency (such as serialization).
Otherwise, you should follow the natural behavior of `Object.keys()`, `foo = bar`, etc. which will preserve the explicit undefined.

#### ✔ DO align copy/iteration behavior with Object.keys()

The prevailing convention is to use `Object.keys()` when iterating or copying data, which includes only string-keyed [enumerable properties](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Enumerability_and_ownership_of_properties) that are owned by the object (not inherited).

Note that it is expected that private metadata attached via `symbol` keys will be elided when iterated, copied, transmitted, or persisted.

### Arguments

#### ✔ PREFER required parameters over optional parameters for **private** functions.

Providing defaults for optional parameters is a powerful tool that can make APIs convenient and pleasant for end users.
However, when loosely employed for private functions that are only used by developers internally, it can become an antipattern.

Consider the following function signature:

```typescript
function createHandle(id: string, onDispose?: () => void): Handle;
```

It is tempting to make the `onDispose` parameter be optional, perhaps because it is not required to get a working `Handle`.
Were this a public API, that might very well be the right call - perhaps most users do not care about when their handles are disposed and we don't want to burden them with additional concepts.
But as an internal API, making the parameter required forces the next developer who uses the function to think about disposal rather than ignoring it.
This may be the difference between checking in a bug or not - perhaps there is some internal code that ought to be run whenever a handle is disposed.

```typescript
function createHandle(id: string, onDispose: () => void): Handle;
```

Whether or not to make a parameter optional is always a judgment call, and there are many times when it is warranted for internal code (for example, a helper that is called many times over in a test suite). However, for many functions that are only called a handful of times or fewer, it can payoff to choose awareness over simple convenience.

#### ✔ PREFER ‘named arguments’ for extensible initialization/configuration APIs

While JavaScript lacks direct support for "named arguments", it is possible to them by using an object literal "property bags":

```typescript
server.connect({ url: string, port: number, compression: Compression });
```

Use of the "named arguments" style is a balance between legibility/extensibility and developer convenience.
In general, "named arguments" should be _preferred_ when...

- An API is often invoked with a large number of parameters, especially when many of those parameters share the same type(s) (e.g., `init(3, 300, 4, 7)`).
- An API accepts multiple optional arguments.
- An API is likely to benefit from future extensibility (e.g., new options).

In general, "named arguments" should be _avoided_ when...

- An API accepts a small number of parameters that are believed to be fixed.
    - An anti-example would be use named arguments for `.slice({ start: 0, end: 10 })`.
      For frequently used APIs with small numbers of arguments, client developers prefer a well-understood convention.

Note: the use of "named arguments" can have performance implications, as it requires an object allocation for each call.
Generally, this is not an issue for our exposed API surface, but internal APIs which are performance-critical should carefully consider if the costs of this pattern outweigh the benefits.

Avoid using combinations of property bags when using this pattern.
Prefer a single object, unless there is a clear logical division between the bags.
The use of multiple property bags makes it confusing for a caller to understand/remember where an individual argument goes.

**Bad**:

```typescript
function foo(someProps: FooProps1, moreProps: FooProps2) {...}
```

Never pass a bag on to another function.
This may overexpose members of the bag and/or lead to coupling of the two functions.
Prefer to destructure the bag immediately in the function to reduce this temptation and also to reduce repetition.

**Good**:

```typescript
function foo(props: IFooProps) {
	const { prop1 } = props;
	bar(prop1);
}
```

```typescript
function foo({ prop1 }: IFooProps) {
	bar(prop1);
}
```

**Bad**:

```typescript
function foo(props: IFooProps) {
	bar(props);
}
```

#### ✘ AVOID mixing user-defined property bags with system-defined property bags

Sometimes it is useful to provide users with a place to store custom/arbitrary data, e.g. to be retrieved from the system at a later point.
The object that holds the user data should not also hold system properties.

Consider this API, where we want a user to store some data in addition to a built-in system property (which the user also sets and reads):

```typescript
interface SystemData {
	_id: string;
}

interface DataStorage<T extends SystemData> {
	getData(): T;
	setData(data: T): void;
}
```

Here, the user is allowed to specify the type of their custom data, but we've stuck our system property (`_id`) into it too.
This is undesirable because our system property could collide with a user property if the user is trying to store an object which already has an `_id` property.
We've prefixed the property with an underscore to reduce the chance of this happening, but it's still not perfect.
Instead, simply move the user data one level down to where it is completely self-contained:

```typescript
interface SystemData<T> {
	id: string;
	userData: T; // There's no problem if something in here is named `id`
}

interface DataStorage<T> {
	getData(): SystemData<T>;
	setUserData(data: SystemData<T>): void;
}
```

Now there is no chance of collision with a predefined user property.

### Errors

#### ✔ DO limit runtime error checking to non-obvious/hard to diagnose errors

Runtime error checking is reserved for non-obvious errors that are difficult to diagnose without runtime assistance.
You should assume that developers have common sense and do not exploit quirks or intentionally circumvent the type system.

#### ✘ DO NOT use assertions for validating user input

An assertion failure indicates a bug in the Fluid Framework itself, not the user's code.
User errors should by signaled by throwing an instance of `Error`, `TypeError`, `ReferenceError`, `RangeError`, `AggregateError` or an appropriate subclass (other built-in error types are reserved for language parsing errors).

- See the [@fluidframework/core-interfaces](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/src/error.ts) package for some example Error subclasses used frequently across the framework.

### Events

#### ✔ DO use the types and conventions shared across the framework codebase

Consistency is valuable for presenting a legible API.
Please don't reinvent the wheel.
Wherever possible, leverage the eventing libraries exported by the [core-interfaces](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/src/events.ts) package.

When this is impractical...

#### ✔ DO adopt EventEmitter’s on/off pattern for register/deregistering event listeners

The prevailing convention among JavaScript frameworks is to adopt EventEmitter’s on/off pattern for register/deregistering event listeners.
The “on” method should be strongly typed over the events known to the emitter (e.g., via <https://43081j.com/2020/11/typed-events-in-typescript>).
It should only allow registrations for known event names, and the corresponding listener functions should be required to have compatible parameters.

#### ✘ AVOID exposing the full EventEmitter interface

While subclassing the EventEmitter type may be a convenient way to implement on/off, it also publicly exposes methods that are intended for private use by the event producer (not the consumer).

The methods recommended for event consumers are:

- on
- off
- once

Other capabilities, such as the ability to emit events, enumerate listeners, detect additional and removal of listeners, etc. should be privately held by the producer.

#### ✔ PREFER composition over inheritance

```typescript
class MyClass {
	private _events: EventEmitter<MyEvents>;
	public events: Listenable<MyEvents>;
}
```

is preferable to

```typescript
class MyClass implements Listenable<MyEvents> {
	private events: EventEmitter<MyEvents>;

	public on<K extends keyof MyEvents>(key: K, listener: (/*...*/) => void) {
		this.events.on(key, listener);
	}

	public off<K extends keyof MyEvents>(key: K, listener: (/*...*/) => void) {
		this.events.off(key, listener);
	}
}
```

because it reduces boilerplate and it groups all event-related behavior under a single property per object.
It also means that any updates to the EventEmitter/Listenable interface will not require changes to your class.

Users interact with your events by doing `foo.events.on(...)` rather than `foo.on(...)`.

#### ✔ DO keep event listener parameters simple

Include parameters that capture data which is going away (e.g., “previousValue” for a “change” event).
Don’t include parameters that can be easily read from the emitting object itself (e.g., “newValue”).
Likewise, don’t include the object emitting the event as a parameter in the listener (e.g., “sender”, “target”); it is easy for the consumer to capture the emitter in the event listener function if they need to.

#### ✘ DO NOT remove, re-order or inspect events as the emitter

A subscriber of an event should be able to assume that their event remains registered until they deregister it themselves.
Registered events should always fire in the order that they were registered.
Though relying on the ordering is often an anti-pattern, a consistent ordering is nonetheless expected by consumers and should be preserved.

The emitter should not have any behavior (other than recording/removing the listener) when a listener is registered/deregistered.
It should also avoid enumerating or counting its registered listeners.

### Documentation

We leverage TSDoc syntax for TypeScript API-level source code documentation.
See our [TSDoc guidelines](./Documentation-Guidelines/Documenting-TypeScript/TSDoc-Guidelines.md) for helpful tips leveraging the syntax.

Documentation for our APIs is publicly available on [fluidframework.com](https://fluidframework.com/docs/apis).
Remember that the documentation you write may be user-facing, so it needs to be accessible and useful!

#### ✔ DO use complete sentences in API documentation

Remember that many of our APIs are or will be visible to other developers, including developers external users.
To ensure our documentation is useful and accessible to the widest audience, our documentation should be written in such a way that it is easily readable by any English reader.

#### ✔ DO document contracts not captured by the type-system

As a general rule, if an API contract cannot be captured by the type-system, then it should be documented.
For example:

```typescript
/**
 * Gets the element at the provided index.
 */
public getAtIndex(index: number): Foo;
```

At the type-system level, the input `index` can potentially be negative, infinite, etc.
What our method does in these cases is unclear.
Does it throw?
Does it return some default value?

There are a few syntactic options for conveying this sort of information - use your best judgment when determining what to use.
A better option for our example method might look something like:

```typescript
/**
 * Gets the element at the provided index.
 * @param index - The index being queried. Must be on [0, {@link Bar.length}).
 * @throws Throws an error if the provided index is out of range.
 */
public getAtIndex(index: number): Foo;
```

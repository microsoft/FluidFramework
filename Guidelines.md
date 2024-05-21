# Framework API Guidelines

This document provides a set of guidelines for crafting framework APIs that are likely to be well-received by TypeScript and JavaScript application developers.
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

-   flexible vs. simple
-   elegant vs. obvious
-   strict vs. agile
-   general vs. familiar
-   explicit vs. concise
-   high-control vs. low-friction

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

#### ✔ DO use function overloading

Because [function overloading](https://www.typescriptlang.org/docs/handbook/2/functions.html#function-overloads) is inconvenient to implement in the JavaScript language, framework engineers often avoid it.
However, overloading is a powerful tool for reducing IntelliSense clutter and helping developers discover alternative ways to express the same operation.

### Naming

#### ✔ DO follow the style conventions used in the TypeScript documentation

This document is not intended to be a style guide, but when questions of style arise, the style used by examples in The TypeScript Handbook is a good representation of the prevailing conventions used by TypeScript developers:

-   Use `PascalCase` for type names.
-   Use `PascalCase` for enum values.
-   Use `camelCase` for function, property, and variable names.

#### ✔ DO optimize discoverability in IntelliSense

Think hard about the first word people will try typing in the code editor when they explore the feature area.
Try to make the first response in IntelliSense the correct entry point to the corresponding feature.

#### ✔ DO use concise names for frequently used APIs

Favor short and memorable names over longSelfDocumentingNames for important and frequently used APIs.
In the JavaScript community, developers assume the shorter the name the more important the API.
Long multi-word names are assumed to be rarely used or semi-internal.

-   Remember to document any aspects that are not captured by the short name in the API documentation!

Make use of well-known abbreviations (but _only_ well-known abbreviations).
A good rule of thumb is to use the abbreviated form if it's what you would say out loud (HTML, JSON, min/max, etc.).

-   Remember to think in terms of accessibility.
    Would a someone who is not a native English speaker understand the abbreviation?
    Would someone outside of Microsoft understand it?

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

-   Choosing between a production or development version of the framework
-   Choosing between React or Svelt interoperability
-   Choosing between Azure or Syntex as a backend

Packages that are versioned separately for the end user’s convenience.

For example, `eslint` is versioned independently from its various plugins.
This helps to clearly differentiate architectural changes from content (i.e. rules) changes that might affect the user.

Note that if the incentive for partitioning into multiple packages is bundle size or IntelliSense clutter, you probably have a different problem.

### Data

#### ✔ PREFER data transparency

The JavaScript ecosystem interoperates primarily through trees of plain data.
Encapsulating data within an opaque object model creates friction when interfacing with 3rd party packages.
When possible, favor consuming and produce trees of JSON-compatible types.

#### ✔ DO express data as a tree of JSON-compatible types

To interoperate with existing backend and frontend technologies, data contracts should be defined using [JSON-compatible types](https://en.wikipedia.org/wiki/JSON#Data_types).
These are:

-   Plain objects (no prototypes, string keys only, single reference)
-   Dense arrays using keys 0..length-1 (no buffers, views, or typed arrays)
-   Strings (valid Unicode only)
-   Finite Float64 numbers (no Infinity, NaN, -0, or BigInt)
    \*Booleans
-   Implicit undefined (optional properties elided by JSON serialization)
-   Null (as empty root or placeholder in arrays – see next guideline.)

This subset of JavaScript types forms a minimal but complete data model that is well supported across data stores and transport protocols.

[GraphQL](https://graphql.org/) is a good example of a framework that embraces JSON as the “lowest common denominator”.
It's worth studying if you’re interested in applying this principle in a cross-language environment.

#### ✔ PREFER `undefined` over `null`

`undefined` is the preferred type for uninitialized variables, missing keys, or a sentinel representing an empty state.
Optional properties and arguments, which are implicitly `undefined`, are generally preferred over explicit `undefined`.

There are, however, a few cases where `null` continues to be appropriate.
The primary use case is JSON serializable data where "implicit undefined" is not an option.
These are:

-   The root of an empty tree ("null”)
-   An empty placeholder in arrays ("[null, 3]")

#### ✔ AVOID distinguishing between implicit and explicit undefined values

In the JavaScript language it is possible to distinguish between a non-existing property and a property that has been explicitly set to the `undefined` value.
You should interpret these identically when reading.

Do not go out of your way elide explicit `undefine`s, except in cases where it improves efficiency (such as serialization).
Otherwise, you should follow the natural behavior of `Object.keys()`, `foo = bar`, etc. which will preserve the explicit undefined.

#### ✔ DO align copy/iteration behavior with Object.keys()

The prevailing convention is to use `Object.keys()` when iterating or copying data, which includes only string-keyed [enumerable properties](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Enumerability_and_ownership_of_properties) that are owned by the object (not inherited).

Note that it is expected that private metadata attached via `symbol` keys will be elided when iterated, copied, transmitted, or persisted.

### Errors

#### ✔ DO limit runtime error checking to non-obvious/hard to diagnose errors

Runtime error checking is reserved for non-obvious errors that are difficult to diagnose without runtime assistance.
You should assume that developers have common sense and do not exploit quirks or intentionally circumvent the type system.

#### ✘ DO NOT use assertions for validating user input

An assertion failure indicates a bug in the Fluid Framework itself, not the user's code.
User errors should by signaled by throwing an instance of `Error`, `TypeError`, `ReferenceError`, `RangeError`, `AggregateError` or an appropriate subclass (other built-in error types are reserved for language parsing errors).

-   See the [@fluidframework/core-interfaces](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/src/error.ts) package for some example Error subclasses used frequently across the framework.

### Documentation

We leverage TSDoc syntax for TypeScript API-level source code documentation.
See our [TSDoc guidelines](https://github.com/microsoft/FluidFramework/wiki/TSDoc-Guidelines) for helpful tips leveraging the syntax.

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

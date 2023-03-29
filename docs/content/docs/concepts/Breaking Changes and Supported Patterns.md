# Breaking Changes and Supported Patterns

Scope: This document is about how changes to packages written in TypeScript impact users of those packages which also use TypeScript.

Audience: This document is intended for developers of TypeScript packages as well as authors of TypeScript code which uses those packages.

Status: This document is an early stage proposal. The policies proposed here are NOT the policies currently adopted for the Fluid Framework packages.

To Reviewers: Two aspects of this document should be evaluated separately. First the proposed system, and second the proposed supported patterns to use with this system. Both are provided in the same document as it would be hard to evaluate the proposed system without some example patterns.

Terminology:

- The Package: a npm package with a TypeScript API.
- User Code: Code which uses The Package.
- Supported Patterns: Collection of rules for User Code specified in the Package's documentation.
- Supported User Code: User Code which follows the Supported Patterns.
- Change: Modification to the Package. Could be picked up by a User by updating the version of the Package they are using.
- Break: The act of causing a previously non-existing issue.
  Can be a compiler error, runtime error, or causing previously Supported User Code to become unsupported.
  For example a Change could break user code by making it not compile, crash, no longer be Supported User Code, return incorrect results etc.
- Backwards Compatible Change: A change to The Package which does not Break any possible Supported User Code.
- Incompatible Change: A Change to The Package which could break a Supported User.

The goal of this document is to justify having "Supported Patterns" as defined above, and to suggest some such patterns and explain their motivations.

## Why have Supported Patterns?

To help the developers of the package communicate clearly about how their changes impact users, they need to make some assumptions.
These assumptions are the Supported Patterns.

One of the most important details the developers of the package should communicate is which changes are Backwards Compatible and which ones are Incompatible.
A common convention in this space is to use [Sematic Versioning](https://semver.org/) to communicate this via the version of the package, but such communication is important even if not using Sematic Versioning.

For this communication to be meaningful both sides have to agree on terminology.
The challenging part of this is providing a precise definition of what is a Backwards Compatible Change and what is an Incompatible Change.
Supported Patterns provide this definition.

Additionally, if the supported patterns are co-designed with recommended design patterns and policies for developing the package, it can help developers of the package reduce the frequency of Incompatible Changes.

The challenge is to pick Supported Patterns and associated design patterns for the package that:

1. Maximize the ease of making user code supported, and make it easy to tell if user code is supported.
2. Make it easy for developers of the package to know if a change is Incompatible.
3. Maximize package developer's ability to make useful changes be Backwards Compatible.
4. Maximize ease of adopting Incompatible Changes in Supported User Code. For example use the compiler to inform Supported Users where they have to update their code to reduce the risk of broken runtime behavior if the necessary adjustment is missed.

## Why Trivial Supported Patterns are not enough:

If deciding all patterns are supported then all changes are Incompatible Changes.
A trivial proof of this is a Supported User could compute a checksum of the package to validate it was loaded correctly.
Such a User would be broken by any possible package change.

Another simple approach would be to define Supported Patterns as TypeScript code which uses the package APIs in such a way that it compiles.
Unfortunately, this doesn't solve the problem: nearly everything is still incompatible change since TypeScript lets you traverse modules objects, inspect the code implementing functions etc.
It's possible to write programs which break for pretty much any change.

A more reasonable but simple supported pattern would be code that only assumes documented behavior about the APIs.
This is more on the right track, but it has issues with ambiguity which tend to lead to one of:

1. User and Package Developer not interpreting the documentation the same, and thus disagreeing on which changes are compatible.
2. A broad interpretation of what behavior is supported, resulting in most changing being Incompatible.
3. A very narrow interpretation of what behavior is supported, making authoring supported user code which actually benefits from using the package effectively impossible.
4. Requiring too much documentation about explicitly what is and is not a supported use on every type.

The rest of this document is about how we can take option 4 here, but structure that documentation in a centralized library of useful patterns which types can refer to to solve the verbosity problem.

# Proposed Rules

If this proposal is accepted, documents defining the rules in a friendly way for users to consume should be produced.
The below can be considered an initial draft for what some of the rules might look like.

## Version Type Variance

### An Example: Modifying interfaces

```typescript
interface Name {
  first: string;
  last?: string;
}
```

Here TypeScript is doing a lot for us.
It defines what values are valid as a `Named`, and what types can be used as a `Named`.
This isn't enough in practice to define a useful Supported Pattern for users of this interface.
Consider the two following examples of User Code for it:

```typescript
// User Code 1
const myName1: Name = { first: "My" };
// User Code 2
const myName2: Name = { first: "My", last: "Name" };
// User Code 3
interface FullName extends Name {
  // Some people have multiple middle names, or none.
  middle: string[];
}
```

What ways can the package change `Named` without breaking any of these users?

```typescript
interface Name {
  first: string;
  last: string; // Make required. Causes User Code 1 to not build.
}
```

```typescript
interface Name {
  first: string;
  middle?: string; // Added optional field. Causes User Code 3 to not build.
  last: string;
}
```

```typescript
interface Name {
  first: string;
  // Removed `last`. Causes User Code 2 to not build.
}
```

### The Rule

As shown in the example above, even when only consider if the code builds, it's impossible to add or remove fields, optional or otherwise, or adjust the optionality of any field on an interface as a backwards compatible change if all three of these patterns are supported.
In general, unless the supported patterns for using an interface is restricted to not permit these kinds of usage, modifying it in a compatible way is impossible.

There are a few approaches that can be taken to resolve this:

1. Restrict the Supported Patterns for the interface. Depending on how its used there are two main choices:
   1. "out": Disallow implementing and extending the interface and modifying instances. This means the package can add members, remove optionality and make members have more specific types. This means that the new interface must be assignable to the old interface. Uses also should not assume that enumerating members of objects that meet the interface won't return unexpected entries (this is true in general, but extra important for interfaces using these rules). This restricts the instances of the interface to being produced by the package making it logically an "output" of the package.
   2. "in": Disallow reading members of the interface (except via `{added: value, ...existingInstance}` pattern). This means the package can remove members, add optionality and make members have more general types. This means that the old interface must be assignable to the new interface. This restricts the instances of the interface to being build but not consumed by user code making it logically an "input" of the package.
2. "Invariant": Create a new interface instead of modifying the existing one. Probably pick one of the above options to apply to the new interface to avoid having to make even more of them.

Interestingly these three cases correspond to [covariant, contravariant and invariant from type systems](<https://en.wikipedia.org/wiki/Covariance_and_contravariance_(computer_science)>), including in TypeScript which added [explicit use of them in 4.7](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html#optional-variance-annotations-for-type-parameters).

Just like TypeScript added support for explicitly restricting usage of generic types based on the variance annotations on its type parameters, we can restrict the Supported Patterns of The Package based on variance annotations we add to its types.
In our example this could look like:

```typescript
/**
 * @out
 */
interface Name {
  first: string;
  last?: string;
}
```

This would make User Code 1 and 2 unsupported. This is supposed to allow changes like:

```typescript
/**
 * @out
 */
interface Name {
  first: string;
  middle: string; // Added. This is supposed to be ok, but can still result in name collisions, like breaking UserCode 3.
  last: string; // Made required. This is ok.
}
```

To solve this issue with User Code 3, we need to decide who owns the unused portion of the namespace on types defined in the package.
Rather than documenting this for every time, a single default policy should be clearly stated, and exception to it can be documented.
Defaulting to the package owning the namespace is probably best, since the User Code can just accept that that use is not supported or extend it using private symbols without conflicting if needed.

These same variance annotations and rules can be applied to all types in the package, defaulting to invariant if not marked.
Classes can default to "out" when marked with `@sealed` (which [already exists](https://api-extractor.com/pages/tsdoc/tag_sealed/)).
Classes which are not `@sealed` are invariant by default since almost any modification to them could break User Code.
The normal variance composition rules apply, so an `out` interface can only take `in` or invariant types as parameters to any methods on it.

`const` module members can be typed as "out" unless documented otherwise.

> **_NOTE:_** Our current type tests attempt to validate all types as if they were invariant.
> The "out" aspect is covered by the backwards compatibility testing and the "in" is covered by the forwards compatibility testing.
> If we adopted this convention, annotating our types could cause the type tests to omit the corresponding check allowing for some tooling based assistance with these rules for the package side.
> It is theoretically possible to provide tooling level assistance about this for the user code side as well.
> There isn't a clear robust solution, but many common cases may be coverable with not too complex custom linter rule.

> **_NOTE:_** This section focuses on type level details, however this same policy can help with clarifying what's supported even if it's not modeled by the type systems. For example an interface that is documented as requiring an integer can be broadened to accept floating point values if it's a member of an "in" interface, but not for an "out" one. This reasoning is useful, even if both cases just use the type `number`.

> **_NOTE:_** Another way to get some tooling support for this is to transform the types when exporting them either manually in the source or as part of publishing. For example if API-extractor could replace `@out` interfaces with types that are not constructable (extend a class with a protected member and private constructor).

## Optional Function Arguments

TypeScript has soundness issues with functions and optional arguments.

For example:

```typescript
// Example function with an optional argument
function processItem(item: string, override?: string): string {
  return override ?? `processed: ${item}`;
}

function processItems(items: string[], f: (item: string) => string): string[] {
  // When an function which requires two arguments is needed (like with Array.map, since it passes the item and the index),
  // a function that requires fewer can be used.
  return items.map(f);
}

// Functions with optional arguments can be assigned to types missing those arguments, as is done here.
// When combined with allowing passing more arguments than needed, optional arguments can be passed incorrectly typed and unexpected data.
// In this case the array ends up [1, 2, 3]: it's not even an array of strings like its type requires.
const notActuallyStrings: string[] = processItems(["a", "b", "c"], processItem);
alert(notActuallyStrings);
```

This issue means that code that gets a function as a parameter can gain unsound behaviors if an optional argument is added to the function.
For example in the case above if `processItem` started without the optional `override`, everything would work fine producing `["a", "b", "c"]`.
However adding the optional `override` causes the output array to be `[1, 2, 3]` which would almost certainly violate the documented behavior from before the extra argument was added. This can be avoided by doing any of the following:

1. When passing a function in a way that could implicitly convert its type, wrap it in a lambda (in the example, replace `processItem` at the end with `(s) => processItem(s)`).
2. Avoid casting functions to have more arguments. In the example replace `(item: string) => string)` with `(item: string, index: number) => string)`
3. Don't have optional arguments.
4. Pick one of the above for every function type usage.

The first two approaches are hard to audit/enforce but allows the package to add optional arguments to functions.
They also make adding extra arguments to callback function types an incompatible change.

This makes the most pragmatic solution to do all of:

1. Try and do #2 above (avoid casting functions to have more arguments). The package must do this everywhere it's relevant and technically only User Code that follows this will be considered a supported pattern.
2. Since we are relying on avoiding implicit casting away of arguments for correctness, adding new arguments to callback functions needs to be considered an Incompatible change, even though it almost always compiles and usually works.
3. Prefer patterns that avoid optional arguments since enforcing these rules is hard and unlikely to be done robustly without compiler assistance.

Some alternatives to using optional arguments:

1. The "keyword arguments" pattern, where an object is provided with named optional fields instead of optional arguments.
   This also solves the issue of order dependency of optional arguments and is great when several optional arguments are needed.
   The type of the object used can be an interface with the "in" variance as described in "Version Type Variance" above to allow adding members.
2. Add alternative functions that take the extra arguments.
   Can be combined with the above to future proof it for when even more arguments are added.
3. Make the existing arguments more flexible.
   For example if the function takes one string, you can replace that argument with a string or configuration object that contains the string and extra optional arguments.

## Module name collisions

User Code which could be broken by a member being added to a module in the Package should not be supported.
This specifically means User Code that does things like:

```typescript
export * from "the-package";
export { nameThatCouldCollide };
```

Is not supported.

## Imports for other than the root

User code which imports any path not at the root of the package is not supported.
This allows refactoring the package's internals.

## Undocumented behavior

User code which depends on any behavior of the package which is undocumented should be unsupported.

## Broken behavior

User code which can not work due to a bug in The Package is not Supported.
This makes changes to the package that cause APIs to not perform as documented incompatible, and fixing such issues compatible.

For example if a function in the package takes in a `number | string`, and always fails to behave as documented when given a string,
changing the type to `number` is an Incomparable Change since it could cause code that sometimes worked (or even always worked) to stop building.
However changing the implementation to produce a better error in this case, or updating the documentation to reflect the actual behavior is a compatible change.

This mostly means that APIs that do not work as documented can have their documentation changed to reflect the previously incorrectly documented behavior and/or the runtime behavior in those cases can be changed (usually fixed or the quality of error improved).

## Globals

The Package should not use globals (note that this means actual globals, like members on `globalThis` not module scope).
This allows user code to use and depend on packages which do use globals without risk of collisions.
Any exceptions to this need to be documented.

## Enums

The Package should specify if enums it declares can have more items added later or not.
This can be seen as a special case of Version Type Variance defined above.

The [non_exhaustive attribute in Rust](https://doc.rust-lang.org/reference/attributes/type_system.html#the-non_exhaustive-attribute) is an example of this.
It has actual compiler support, but it can also just be a convention (and possible a linter rule to help).

# Related work

[semver-ts](https://www.semver-ts.org/) addresses a very similar topic, but focuses on compile errors and not the more general "issues" of which compile errors are a subset. It covers how this relates to variance and its section on "Avoiding user constructibility" suggests several approaches including the approach of doing so through documentation, which is what the proposed "@out" tag above does.

Rust's [non_exhaustive attribute in Rust](https://doc.rust-lang.org/reference/attributes/type_system.html#the-non_exhaustive-attribute).

Rust's [Coherence and Orphan Rules](https://github.com/Ixrec/rust-orphan-rules) are designed to avoid possible future conflicts.

Rust's [rust-semverver](https://github.com/rust-lang/rust-semverver) and Fluid's type tests are example tooling to try and help discover changes which break user code's ability to compile.
As far as I'm aware neither currently attempts to address rules for Supported Patterns which the compiler doesn't capture.
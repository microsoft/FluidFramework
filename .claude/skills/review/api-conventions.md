# Fluid Framework API Conventions — Review Criteria

> Source: https://github.com/microsoft/FluidFramework/wiki/Coding-Guidelines
>
> This is a distilled, review-focused version of the wiki page. If this file feels outdated, re-check the source.

## Design Philosophy

- **Design for end users, not framework engineers.** Users prioritize convenience and "good enough" over perfection. Flag APIs that feel over-engineered or expose unnecessary complexity.
- **Don't over-guard against misuse.** Users must be able to work without full understanding. Excessive safeguards raise the learning curve. If the code adds a runtime check or throws for a scenario that's merely suboptimal (not dangerous), flag it.
- **Play well with others.** APIs should interoperate via plain data and callbacks. Flag APIs that force foundational lock-in or require adopting the entire framework.
- **New terminology needs immediate, obvious value.** If a new concept, pattern, or abstraction is introduced, it must justify the learning investment. Developers have divided attention across dozens of packages.
- **Provide reasonable defaults for boundary cases.** Prefer "not an error" behavior (like `[].slice(0, 10)` returning `[]`) over throwing when a reasonable default exists.

## Naming

- `PascalCase` for type names and enum values. `camelCase` for functions, properties, variables.
- **No `I` prefix on interfaces.** Prefer `Foo` / `DefaultFoo` over `IFoo` / `Foo`.
- **Type parameters prefixed with `T`.** Use full names (`TNode`, `TSchema`) for non-trivial cases, not single letters. Include `@typeParam` TSDoc comments.
- **Functions use verb phrases.** `createFoo()` not `foo()`. Distinguishes actions from objects.
- **Optimize IntelliSense discoverability.** Anticipate what users will type first. The first autocomplete result should be the correct entry point.
- **Avoid abbreviations** except very common ones (HTML, JSON). Unclear to non-native speakers.
- **Concise names for frequently used APIs.** Short names signal importance; long names suggest rare use.
- **Well-known prefixes/suffixes:**
  - `as-` — type cast with checks, returns different facet of original
  - `Default-` — built-in/common implementation
  - `is-` / `has-` — boolean indicators (prefer `is` when natural)
  - `to-` — constructs via copy
  - `from-` — constructs via conversion

## Type Design

- **Avoid exposing advanced TypeScript constructs** in public APIs. Complex types create friction and clutter IntelliSense. Developer helpfulness > strict correctness.
- **Avoid unnecessary generics.** If a generic parameter only appears as input (not preserved across input/output), use simpler typing.
- **Use function overloading** when an API accepts different argument shapes. Reduces IntelliSense clutter despite implementation inconvenience.
- **Express data as plain JavaScript data shapes.** Plain objects (string keys), dense arrays, Unicode strings, finite Float64 numbers, booleans, undefined, null.
- **Prefer `undefined` over `null`** for uninitialized/missing/empty states. Use `null` only when required for JSON serialization.
- **Don't distinguish implicit vs. explicit `undefined`.** Interpret both identically.

## API Shape

- **Prefer required parameters for private/internal functions.** Forces developers to consciously consider all aspects.
- **Named arguments (object literals) for extensible APIs.** Use when: many parameters, optional arguments, or future extensibility. Avoid when: few fixed parameters or established conventions.
- **Don't mix user data and system properties in the same bag.** Separate user data one level deeper to prevent collisions (e.g., `{ id: string; userData: T }` not `{ id: string } & T`).
- **Minimize required packages.** Ideal is one package for end users.

## Error Handling

- **Limit runtime error checking** to non-obvious or hard-to-diagnose errors. Assume developers have common sense and aren't circumventing the type system.
- **Assertions indicate framework bugs, not user errors.** For user input validation, use `UsageError`, `Error`, `TypeError`, `ReferenceError`, `RangeError`, or `AggregateError`.

## Events

- **Use on/off pattern** (standard across JS frameworks). Strongly typed to known events only.
- **Don't expose the full EventEmitter interface.** Only expose `on`, `off`, `once` to consumers. Hold emission capabilities privately.
- **Prefer composition over inheritance** for event-emitting classes. Use private EventEmitter with public Listenable property.
- **Keep event listener parameters simple.** Include data that disappears (like "previousValue"); exclude data readable from the emitter itself.
- **Don't remove, reorder, or inspect event registrations** from the emitter side.

## Documentation

- **Complete sentences in API documentation.** Accessible to all English readers, including external developers.
- **Document contracts not captured by the type system.** If behavior can't be expressed through types (index bounds, error conditions, ordering guarantees), document it.

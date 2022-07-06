
<!--- Copyright (C) Microsoft Corporation. All rights reserved. -->

## TSDoc Format

Use [TSDoc](https://tsdoc.org/) syntax when writing TypeScript code within the Fluid Framework.

**Note**: TSDoc is still under active development / design.
Many syntactical elements are still under active design.
If you have questions about limitations, etc., be sure to check out their [github](https://github.com/microsoft/tsdoc/issues).

### TSDoc Example

```typescript
/**
 * Represents a Foo, as implemented by wrapping a {@link Bar}.
 */
export class Foo {
	/**
	 * Underlying data representation of the Foo.
	 */
	public bar: Bar;

	/**
	 * Creates a {@link Baz} from {@link bar} and the provided {@link qux}.
     *
	 * @param qux - Contains the extra information needed to create the Baz.
	 */
	public createBaz(qux: Qux): Baz {
		...
	}
}
```

## Formatting Guidelines

### Single-Line Comments

The single-line TSDoc syntax should never be used.
Even for short comments, use the standard, multi-line format.

#### Example: Single-line comment

##### Single-line comment: Bad

```typescript
/** Single-line comment */
export function foo() {
	...
}
```

##### Single-line comment: Good

```typescript
/**
 * Single-line comment
 */
export function foo() {
	...
}
```

### Custom Formatting

Documentation content (within the scope of a given documentation block) should be formatted as plain text.
No custom indentation or other formatting should be used.

Custom formatting will be largely disregarded by tooling, and may cause undesired behavior in some cases.

When writing more complex API source-code documentation, please utilize TSDoc's suite of [tags](#tsdoc-tags) instead.

### Example: Multi-line parameter comment

When writing a comment for an '@param' tag, it might be tempting to use custom indentation, etc. to make the formatting look more appealing.
Please do not do this.
Not only will the custom formatting not be picked up by documentation generation, but it also makes our documentation inconsistent.

#### Custom Indentation: Bad

This documentation attempts to custom indent parameter constraints.

```typescript
/**
 * Moves the element by the provided offsets.
 *
 * @param xOffset - Offset along the x-axis to move the item.
 *                Must be \>= {@link xMin}.
 *                Must be \<= {@link xMax}.
 *
 * @param yOffset - Offset along the y-axis to move the item.
 *                Must be \>= {@link yMin}.
 *                Must be \<= {@link yMax}.
 */
function move(xOffset: number, yOffset: number) {
	...
}
```

#### Custom Indentation: Good

Instead, simply line-wrapping and indenting the documentation contents of each parameter tag as normal is preferred.

```typescript
/**
 * Moves the element by the provided offsets.
 *
 * @param xOffset - Offset along the x-axis to move the item.
 * Must be \>= {@link xMin}.
 * Must be \<= {@link xMax}.
 *
 * @param yOffset - Offset along the y-axis to move the item.
 * Must be \>= {@link yMin}.
 * Must be \<= {@link yMax}.
 */
function move(xOffset: number, yOffset: number) {
	...
}
```

### Line Breaks

Because source-code comments are frequently line-broken based on some maximal line length, TSDoc comments are parsed as follows by API-Documenter:

-   Adjacent lines (lines separated by exactly 1 newline) are rendered on **the same line**
-   Lines separated by 2 or more newlines are rendered as separate paragraphs (with a break between them)

If you wish for line breaks to appear in the generated API documentation, be sure to add an extra line between your content.

Note that this includes things like lists.
If you wish to include a bulleted or numbered list in your documentation, you will need to add extra lines between the list items.

### Line Breaks Example: Bad

```typescript
/**
 * Updates the contents by applying the following steps in sequence:
 *
 * 1. clears obsolete content
 * 2. appends new content
 * 3. invokes provided callback for content element
 */
function update(callback: Callback) {
	...
}
```

This will produce Markdown like the following:

> Updates the contents by applying the following steps in sequence:
>
> 1. clears obsolete content 2. appends new content 3. invokes provided callback for content element

### Line Breaks Example: Good

```typescript
/**
 * Updates the contents by applying the following steps in sequence:
 *
 * 1. clears obsolete content
 *
 * 2. appends new content
 *
 * 3. invokes provided callback for content element
 */
function update(callback: Callback) {
	...
}
```

This will produce Markdown like the following:

> Updates the contents by applying the following steps in sequence:
>
> 1. clears obsolete content
>
> 2. appends new content
>
> 3. invokes provided callback for content element

## TSDoc Tags

TSDoc tags are broken down into 3 categories: [Block tags](#Block-Tags), [Modifier tags](#Modifier-Tags), and [Inline tags](#Inline-Tags).

For an overview on the difference between the 3, see [here](https://tsdoc.org/pages/spec/tag_kinds/).

### Block Tags

See [here](https://tsdoc.org/pages/spec/tag_kinds/#block-tags) for an overview of block tags.

#### \@param

See: <https://api-extractor.com/pages/tsdoc/tag_param/>

##### Block Tags: Guidance

This should be used for any documentation pertaining to a particular parameter for the purpose of documenting contracts, side effects, or any other non-redundant semantic information.

Notes:

-   \@param tags should be listed in the same order as the corresponding parameters appear in the function / method signature.
-   \@param blocks should always be formatted to include a '-' after the parameter name.

##### Block Tags: Example

```typescript
/**
 * Rotates each element of each of the provided shapes by the specified rotation.
 *
 * @param shapes - The shapes to be rotated.
 * Note: the elements of the list are rotated in place, so this list’s contents are mutated.
 * The number of elements is not changed.
 *
 * @param clockwiseRotationInDegrees - Must be on [0, 360).
 */
public rotateEntries(shapes: ShapeList, clockwiseRotationInDegrees: number): void;
```

#### \@returns

See: <https://api-extractor.com/pages/tsdoc/tag_returns/>

##### \@returns: Guidance

Similar to [@param](#param), this should be used for any documentation pertaining to the return value of a function, method, etc. for the purpose of documenting contracts, side effects, or any other non-redundant semantic information.

##### \@returns: Rationale

Helps to clearly differentiate what a function/method _does_ from what it _produces_.
Additionally helps with IDE hover-over behaviors.

##### \@returns: Example

```typescript
/**
 * Rotates each element of each of the provided shapes by the specified rotation.
 *
 * @param shapes - The shapes to be rotated.
 * @param clockwiseRotationInDegrees - Must be on [0, 360).
 * @returns A list parallel to the provided {@link ShapeList} whose elements are that of those shapes, rotated by the specified rotation.
 */
public rotateEntries(shapes: ShapeList, clockwiseRotationInDegrees: number): ShapeList;
```

#### \@typeParam

See: <https://api-extractor.com/pages/tsdoc/tag_typeparam/>

##### \@typeParam: Guidance

This tag should be used to document generic type parameters when the semantics of the type being constrained to are unclear.
For example, when constraining to a complex union type.

Whenever possible, it is recommended to extract as much semantic information out of function/method-level documentation and into type-level documentation.
This enables easier documentation reuse. The `@typeParam` block should be reserved for additional information not already represented by any type constraints.

##### \@typeParam: Rationale

Especially for complex generic types, this can be incredibly helpful for providing a semantic explanation of what the type represents.

##### \@typeParam: Examples

###### Constraining to an already-documented type

In this example, we are constraining type parameter `T` to `Foo`, a type we have imported from elsewhere that is already documented.

In this case, we only need the `@typeParameter` tag if there is any additional type-level context a user of the API would need to know that is not already encapsulated by `Foo`'s type documentation. If no additional context is needed, the `@typeParameter` block can be omitted!

```typescript
/**
 * ...
 */
export interface Foo {
	...
}

/**
 * ...
 *
 * @typeParam Supplementary type semantics of T not represented by Foo.
 */
export function bar<T extends Foo>(input: T): Baz {
	...
}
```

###### Constraining to a complex union type

In this example, we are constraining type parameter `T` to `Bar | Baz | undefined`.
In this case, it is important that we document what this type means, as the semantics of `Bar | Baz | undefined` are not necessarily clear.

There are two reasonable approaches here, but one is definitely preferred when possible.

**Good:**

```typescript
/**
 * ...
 *
 * @typeParam T Semantic documentation for union type: `Bar | Baz | undefined`.
 */
export function Foo<T extends Bar | Baz | undefined>(input: T): number {
	...
}
```

**_Better:_**

Extracting the type and its documentation out of the function allows it to be re-used without writing redundant documentation!

```typescript
/**
 * Semantic documentation for the union type `Bar | Baz | undefined`, as it is used by functions in this module.
 */
export const type Qux = Bar | Baz | undefined;

/**
 * Foo documentation
 */
export function Foo<T extends Qux>(input: T): number {
	...
}

/**
 * Foo2 documentation
 */
export function Foo2<T extends Qux>(input1: T, input2: T): number {
	...
}
```

#### \@remarks

See: <https://api-extractor.com/pages/tsdoc/tag_remarks/>

##### \@remarks: Guidance

This tag should be used to offer additional context about the API beyond the short summary offered as a part of the main comment body.

##### \@remarks: Rationale

Complex APIs often require more than a one or two sentence explanation.
In these cases, it is often useful to offer a separate, more detailed explanation of the API and its requirements, while preserving a brief explanation for display in hover-over behavior, etc.

##### \@remarks: Example

```typescript
/**
 * Calculates the nth value of the Fibonacci Sequence.
 *
 * @remarks This function uses the naive, recursive implementation.
 * This should not be used in performance-critical code.
 */
export function calculateFibonacci(n: number): number {
	...
}
```

#### \@privateRemarks

See: <https://api-extractor.com/pages/tsdoc/tag_privateremarks/>

##### \@privateRemarks: Guidance

This tag should be used to offer context that is not needed by consumers of the API, but would be useful to developers working on the API itself.

Note: `privateRemarks` comments **are not** included in generated API documentation.
They are strictly there for additional comments useful to developers working with the code.

##### \@privateRemarks: Rationale

It is often useful to leave additional context about an API for developers who will be working on it in the future.
That said, such documentation is not useful to consumers of the API, and should therefore not be included in what consumers see when they look at it.

These blocks are often a good place to put TODO comments that consumers of the code do not need to be aware of.

##### \@privateRemarks: Example

```typescript
/**
 * Creates an {@link Element} from this.
 *
 * @privateRemarks Note that it would be possible to memoize the results of this.
 * If this is ever shown to be performance critical, this can be updated to do so.
 */
public generateElement(): Element {
	...
}
```

#### \@example

See: <https://api-extractor.com/pages/tsdoc/tag_example/>

##### \@example: Guidance

This tag should be used to offer example usage of the associated API using code samples.

Note that you may use this tag multiple times on the same API.
Multiple examples should appear in separate `@example` blocks.

##### \@example: Rationale

Especially for complex APIs, it can be incredibly useful for consumers to see sample usages of the API.

##### \@example: Example

The following example is a trivial one, but it illustrates the idea, and offers an example of the intended format (as supported by API-Documenter).

````typescript
/**
 * Calculates and returns the square root of the provided value.
 *
 * @example
 * ```typescript
 * squareRoot(4); // Returns 2
 * ```
 */
export function squareRoot(value: number): number {
	...
}
````

When possible, prefer to write comments explaining examples inside the code block.
Though API extractor gives examples containing leading non-code lines, these don't render correctly in Visual Studio Code's preview functionality.

###### \@example: Bad (Doesn't render in VSCode)

````typescript
/**
 * Calculates and returns the square root of the provided value.
 *
 * @example
 * Returns 2
 * ```typescript
 * squareRoot(4);
 * ```
 */
export function squareRoot(value: number): number {
	...
}
````

#### \@deprecated

See: <https://api-extractor.com/pages/tsdoc/tag_deprecated/>

##### \@deprecated: Guidance

Use this tag to indicate that the associated API has been deprecated.

This tag should always be followed with any information a developer would need to know to migrate their code off of the deprecated API.,

-   See [API Deprecation](https://github.com/microsoft/FluidFramework/wiki/API-Deprecation) for a more complete overview of our deprecation process.

##### \@deprecated: Example

```typescript
/**
 * Standard foo documentation.
 *
 * @deprecated Please use {@link bar} instead.
 */
export function foo() {
	...
}
```

#### \@defaultValue

See <https://api-extractor.com/pages/tsdoc/tag_defaultvalue/>

##### \@defaultValue: Guidance

This tag is used to document the contractual default for a property/field value.
It should be used any time the default value is not codified directly on the property/field.

##### \@defaultValue: Example

```typescript
interface Foo {
    ...

    /**
     * ...
     *
     * @defaultValue 1
     */
    bar?: number;
}
```

In this example, the `bar` property is optional.
But for the consumer, what does it mean if they don't specify a value?
This is vital information for the consumer to have when using our APIs!
The `defaultValue` tag gives them an explicit answer to this question.

This also serves a single point of truth in terms of the contract regarding `bar`.
Internal code handling the property's absence will be required to respect its documented default.

### Modifier Tags

See [here](https://tsdoc.org/pages/spec/tag_kinds/#modifier-tags) for an overview of modifier tags.

`Modifier tags` stand alone, and are not expected to be accompanied by any documentation content.

Note: We recommend placing `Modifier tags` at the **end** of a TSDoc comment.
Doing so helps them stand out better from the other semantic documentation.

#### \@sealed

See: <https://api-extractor.com/pages/tsdoc/tag_sealed/>

##### \@sealed: Guidance

Use this to document a class or class member that is not intended to be extended by a child class.

Note: the TypeScript compiler will not enforce this, and neither does API-Extractor (though they have stated they might in the future).

Any change to an API marked as `sealed` which does not break usages of the type itself, but could break sub-classes created despite the documentation **_are not_** considered [breaking changes](../../Source-Control-Guidelines/Breaking-Changes.md).

-   See [TypeScript API Reasonable Use](../Reasonable-Use.md) for more details on "Reasonable Use" contracts.

If you wish to explicitly annotate an API as extendable, use the [@virtual](#virtual) tag.

##### Examples

```typescript
/**
 * @sealed This type may be used, but must not be extended.
 */
export class Foo {}
```

```typescript
export class Foo {
	/**
	 * Creates an {@link Bar} from this.
     *
	 * @sealed This member may be used, but must not be overridden.
	 */
	public createBar(): Bar {
		...
	}
}
```

#### \@virtual

See: <https://api-extractor.com/pages/tsdoc/tag_virtual/>

##### \@virtual: Guidance

Use the `@virtual` tag to mark a class member as being extendable by consumers.

Note: unless a member is explicitly marked as `@sealed`, it is assumed that consumers may extend it.
That said, this tag can be useful to indicate to the user that the type is _intended_ to be used in that manner.

It is recommended that any subclass which extends a member annotated with `@virtual` tag use the [@override](#override) tag.

##### Example

```typescript
public class Foo {
	/**
	 * Creates an {@link Bar} from this.
     *
	 * @virtual This implementation is naive. Subclasses may wish to do something smarter.
	 */
	public createBar(): Bar {
		...
	}
};
```

#### \@override

See: <https://api-extractor.com/pages/tsdoc/tag_override/>

##### \@override: Guidance

The `@override` tag may be used on any class member which is overriding the base behavior of a parent class.

Note: API-Extractor does not currently guard against the use of `override` on the member of a class which is marked as `sealed` in the parent class.
Though they have said they might add support for that in the future.

If there is no need for further clarifying documentation beyond the parent class's member documentation, we recommend using the [{@inheritDoc}](#inheritDoc) tag, rather than duplicating documentation.

##### \@override: Rationale

Clearly declaring a member as being an override of some base class member makes it significantly easier for consumers of the class to differentiating class-local members from overridden parent members.

##### \@override: Example

```typescript
public class Baz: Foo {
	/**
	 * Creates an {@link Bar} from this.
     *
	 * @override
	 */
	public createBar(): Bar {
		...
	}
};
```

#### \@readonly

See: <https://api-extractor.com/pages/tsdoc/tag_readonly/>

##### \@readonly: Guidance

The `@readonly` tag can be used to indicate that the associated entity is to be considered `readonly`.
I.e. it's value is not changed after being initialized.

This tag **_should not_** be used on any class member which already configured as `readonly` via the TypeScript type system, but can be used in instances where it is not possible to use TypeScript's readonly to enforce invariants.

-   Note: whenever possible, TypeScript's native `readonly` should be used in place of this tag.
    This tag should _only_ be used when that is not possible.

##### \@readonly: Examples

###### \@readonly: Bad

```typescript
/**
 * ...
 *
 * @readonly
 */
public readonly foo: Bar;
```

###### \@readonly: Good

```typescript
/**
 * ...
 *
 * @readonly
 */
public foo: Bar;
```

#### \@packageDocumentation

See: <https://api-extractor.com/pages/tsdoc/tag_packagedocumentation/>

##### \@packageDocumentation: Guidance

A comment with this tag should only appear once, and only in the `index.ts` file representing the API entry-point for a package.

##### \@packageDocumentation: Example

```typescript
/**
 * ...
 *
 * @packageDocumentation
 */

export * from ...
```

#### \@eventProperty

See <https://api-extractor.com/pages/tsdoc/tag_eventproperty/>

#### \@eventProperty Guidance

Properties whose values are event objects should be annotated with this tag.
It is a useful signal to the consumer as to how the property should be used.

#### \@eventProperty Example

```typescript
/**
 * This event is fired whenever the button is clicked.
 *
 * @eventProperty
 */
public get clicked(): Event {
    ...
}
```

#### Release Tags

Release tags can be used to explicitly denote the classification of release an annotated API is intended to be included with.

-   [@public](https://api-extractor.com/pages/tsdoc/tag_public/)
-   [@internal](https://api-extractor.com/pages/tsdoc/tag_alpha/)
    -   Also see [@preapproved](https://api-extractor.com/pages/tsdoc/tag_preapproved/)
-   [@beta](https://api-extractor.com/pages/tsdoc/tag_beta/)
-   [@alpha](https://api-extractor.com/pages/tsdoc/alpha/)

Notes:

-   At most one release tag may appear within a single TSDoc comment.
-   Aside from `public`, we do not yet have explicit guidelines for the use of release tags within the Fluid Framework.

### Inline Tags

The following tags are meant to be used _inline_, i.e. within documentation blocks potentially associated with other tags.

See [here](https://tsdoc.org/pages/spec/tag_kinds/#inline-tags) for an overview of inline tags.

#### {\@link}

See: <https://api-extractor.com/pages/tsdoc/tag_link/>

Note: there are some current limitations to {\@link}.
The concept of [declaration references](https://github.com/microsoft/tsdoc/issues/9) is only partially complete.

-   See [here](https://tsdoc.org/pages/tags/link/) for some examples of `declaration references` and other sample {\@link} usages.

##### \@link: Guidance

Use this to link to another API member.

##### \@link: Enforcement

While ESLint will enforce correct syntax for this tag, it does not enforce that the entity being referenced is correct / unambiguous.
Fortunately, for packages using API-Extractor and API-Documenter, the 2 tools will offer some validation.

##### \@link: Examples

###### Linking to another member in the same package

```typescript
/**
 * ...
 */
export interface Bar {
	...
}

/**
 * Foo implementation of {@link Bar}.
 */
export class Foo extends Bar {
	...
}
```

###### Linking to an imported member from another package

```typescript
import { Bar } from 'baz'

/**
 * Foo implementation of {@link baz#Bar}.
 */
export class Foo extends Bar {
	...
}
```

#### {\@inheritDoc}

See: <https://api-extractor.com/pages/tsdoc/tag_inheritdoc/>

##### \@inheritDoc: Guidance

Use the `@inheritDoc` tag to indicate that the associated member's documentation is the same as some other API member.

##### \@inheritDoc: Rationale

This can be extremely useful in reducing duplicated documentation - especially when implementing an interface, or overriding members of a parent class.

##### \@inheritDoc: Enforcement

While ESLint will enforce correct syntax for this tag, it does not enforce that the entity being referenced is correct / unambiguous.
Fortunately, for repositories using API-Extractor and API-Documenter, the 2 tools will offer some validation.

##### \@inheritDoc: Examples

###### Inheriting documentation from another member in the same package

```typescript
/**
 * ...
 */
export interface Logger {
	/**
	 * ...
	 */
	public log(data: any);
}

/**
 * ...
 */
export class ConsoleLogger extends Logger {
	/**
	 * {@inheritDoc Logger.log}
	 */
	public log(data: any) {
		...
	}
}
```

###### Inheriting documentation from an imported member from another package

```typescript
import { Logger } from 'telemetry';

/**
 * ...
 */
export class ConsoleLogger extends Logger {
	/**
	 * {@inheritDoc telemetry#Logger.log}
	 */
	public log(data: any) {
		...
	}
}
```

#### Link Aliasing

It is also possible to alias links, including both symbol and URL links. So if you wish to control how the link will appear textually, this is an option.

Note that this syntax works for both [{@link}](#link) and the [{@inheritDoc}](#inheritDoc) tags.

##### Link Aliasing Example

```typescript
/**
 * ...
 *
 * Also see {@link https://bar.baz | Baz}.
 */
export class Foo {
	...
}
```

The markdown documentation that would be generated using API-Documenter in this example would look like the following:

```markdown
Foo documentation.

Also see [Baz](https://bar.baz).
```

## Documenting Modules

For module-level documentation, simply add a standard `TSDoc` comment before any declaration in that file.
Note that this will only work if that first declaration also has a TSDoc comment.

I.e. the following is valid and will work as desired:

```typescript
/**
 * This file contains utilities for working with Foo.
 */

/**
 * Creates a Foo.
 */
function CreateFoo(): Foo {
  ...
}
```

But _this_ will not work as desired:

```typescript
/**
 * This file contains utilities for working with Foo.
 */

function CreateFoo(): Foo {
  ...
}
```

If `CreateFoo` does not have a doc comment, the file-level comment will be interpreted as being associated with the function.

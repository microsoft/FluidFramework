# Comment Syntax

When documenting TypeScript code, we generally use one of three syntaxes:

1. [TSDoc](./Documenting-TypeScript/TSDoc-Guidelines.md) (`/** */`) syntax
2. Inline (`//`) syntax
3. Block (`/* */`) syntax

This document outlines basic guidance for when to use each variant.

# TSDoc syntax

## When to use

As a general rule, TSDoc syntax should be used any time you are documenting a particular declaration or API.
Regardless of whether or not that declaration is exported by the package or even by the module, TSDoc syntax should be used over alternatives.

### Example

```typescript
/**
 * Description of Foo
 */
export interface Foo { ... }
```

## When to avoid

TSDoc comments are applied to whatever declaration follows them.
For this reason, you should not use TSDoc syntax when the comment is not associated with a specific declaration.

## TSDoc Guidance

For more specific guidance and examples of leveraging TSDoc syntax, see [TSDoc Guidelines](./Documenting-TypeScript/TSDoc-Guidelines.md).

# Inline syntax

## When to use

As a general rule, inline comment syntax should be used when describing what code is _doing_.

### Example

Good:

```typescript
// Calculate the sum of `a` and `b`, log it, and return it.
const sum = a + b;
console.log(sum);
return sum;
```

In this example, the comment is intended to describe what the subsequent lines of code are _doing_, rather than attempting to annotate the local variable `sum`, so an inline comment is preferred.

## When not to use

Declarations, and particularly _APIs_, should generally prefer TSDoc syntax over inline syntax.

# Block syntax

As a general rule, block syntax should only be used when neither [TSDoc syntax](#tsdoc-syntax) nor [Inline syntax](#inline-syntax) are appropriate.

## Examples

### Labeling function parameters

```typescript
const myFoo = foo(/* bar */ true, /* baz */ true);
```

### JSX

```tsx
return (
	<Foo>
		{/* Comment about contents */}
		<Bar />
	</Foo>
);
```

# Rules of thumb

- If documentation is intended to describe a specific declaration or API, use [TSDoc syntax](#tsdoc-syntax).
- If documentation is intended to describe what code is doing, use [Inline syntax](#inline-syntax).
- If neither of the above are appropriate, use [Block syntax](#block-syntax).

# Advanced

## Region comments

When you wish to break up code into logical groupings, and refactoring the code along those logical groupings isn't applicable, consider using region comments.

These can often be especially useful when a block of code performs a series of steps in sequence.
Unit tests often fit this description.

Using this syntax makes it much more clear exactly which lines of code are being described by one or more comments where other options are less clear.

Intellisense understands this syntax and will let you collapse and expand these region blocks, making it easier to navigate the code!

### Example

```typescript
it("foo", () => {
	// Description of what is going on in the setup step.
	// #region Setup
	...
	// #endregion

	// Description of what is going on in the action step.
	// #region Action
	...
	// #endregion

	// Description of what is going on in the validation step.
	// #region Validation
	...
	// #endregion
});
```

# See Also

- [TSDoc Guidelines](./Documenting-TypeScript/TSDoc-Guidelines.md)

---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
section: tree
---

Enforce use of TreeViewConfiguration's constructor

`TreeViewConfiguration` is `@sealed`, meaning creating custom implementations of it such as assigning object literals to a `TreeViewConfiguration` or sub-classing it are not supported.
This reserved the ability for the Fluid Framework to add members to this class over time, informing users that they must use it in such a way where such changes are non-breaking.
However, there was no compiler-based enforcement of this expectation.
It was only indicated via documentation and an implicit assumption that when an API takes in a typed defined as a class, that an instance of that class must be used rather than an arbitrary object of a similar shape.

With this change, the TypeScript compiler will now inform users when they invalidly provide an object literal as a `TreeViewConfiguration`.

More specifically this causes code like this to produce a compile error:

```typescript
// Don't do this!
const view = tree.viewWith(
	{ schema: TestNode, enableSchemaValidation: false },
);
```

The above was never intended to work, and is not a supported use of the `viewWith` since it requires a `TreeViewConfiguration` which is sealed.
Any code using the above pattern will break in Fluid Framework 2.2 and above. Such code will need to be updated to the pattern shown below.
Any code broken by this change is technically unsupported and only worked due to a gap in the type checking. This is not considered a breaking change.
The correct way to get a `TreeViewConfiguration` is by using its constructor:

```typescript
// This pattern correctly initializes default values and validates input.
const view = tree.viewWith(
	new TreeViewConfiguration({ schema: TestNode }),
);
```

Skipping the constructor causes the following problems:

1. `TreeViewConfiguration` does validation in its constructor, so skipping it also skips the validation which leads to much less friendly error messages for invalid schema.
2. Skipping the constructor also discards any default values for options like `enableSchemaValidation`.
This means that code written in that style would break if more options were added. Since such changes are planned,
it is not practical to support this pattern.

---
"fluid-framework": minor
"@fluidframework/tree": minor
---

Enforce use of TreeViewConfiguration's constructor

`TreeViewConfiguration` is `@sealed` meaning creating custom implementations of it such as assigning object literals to a `TreeViewConfiguration` or sub-classing it are not supported.
This reserved the ability for the authors of it (Fluid Framework) to add members.
This policy however was only indicated via documentation,
and an implicit assumption that when an API takes in a typed defined as a class, that an instance of that class must be used.

This change improves discoverability of this policy by enabling the TypeScript compiler to inform users when they invalidly provide an object literal as a `TreeViewConfiguration`.

More specifically this causes code like this to produce a compile error:

```typescript
const view = tree.viewWith(
	{ schema: TestNode, enableSchemaValidation: false },
);
```

The above was never intended to work, and is not a supported use of the `viewWith` since it requires a `TreeViewConfiguration` which is sealed.
Any code using the above pattern will break and will need to be updated to the pattern shown below.
As all code broken by this is technically unsupported and only worked due to a gap in the type checking,
this is not considered a breaking change, and is ok to be included in a minor version.
The correct way to get a `TreeViewConfiguration` is by using its constructor:

```typescript
const view = tree1.viewWith(
	new TreeViewConfiguration({ schema: TestNode }),
);
```

`TreeViewConfiguration` does validation in its constructor.
Skipping the constructor avoids the validation which could lead much less friendly errors for invalid schema.
Additionally skipping the constructor discarded support for default values for options like `enableSchemaValidation`.
This means that code written in that style would break if more options were added: such changes are planned,
which makes keeping this style working is not practical.

---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Fix typing bug in `adaptEnum` and `enumFromStrings`

When using the return value from [`adaptEnum`](https://fluidframework.com/docs/api/v2/tree#adaptenum-function) as a function, passing in a value who's type is a union no longer produced an incorrectly typed return value. This has been fixed.

Additionally [`enumFromStrings`](https://fluidframework.com/docs/api/v2/tree#enumfromstrings-function) has improved the typing of its schema, ensuring the returned object's members have sufficiently specific types.
Part of this improvement was fixing the `.schema` property to be a tuple over each of the schema where it was previously a tuple of a single combined schema due to a bug.

One side-effect of these fixes is that narrowing of the `value` field of a node typed from the `.schema` behaves slightly different, such the node type is now a union instead of it being a single type with a `.value` that is a union.
This means the `.value` property needs to be read into its own variable to be able to be narrowed (for example in a switch statement).

```typescript
const Mode = enumFromStrings(schema, ["Fun", "Bonus"]);
type Mode = TreeNodeFromImplicitAllowedTypes<typeof Mode.schema>;
const node = new Mode.Bonus() as Mode;

// node.value now must be copied out into its own variable for the switch to narrow it correctly.
const value = node.value;

switch (value) {
	case "Fun": {
		assert.fail();
	}
	case "Bonus": {
		// This one runs
		break;
	}
	default:
		unreachableCase(value);
}
```

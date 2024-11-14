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

One side-effect of these fixes is that narrowing of the `value` field of a node typed from the `.schema` behaves slightly different, such that the node type is now a union instead of it being a single type with a `.value` that is a union.
This means that narrowing based on `.value` property narrows which node type you have, not just the value property.
This mainly matters when matching all cases like the switch statement below:

```typescript
const Mode = enumFromStrings(schema, ["Fun", "Bonus"]);
type Mode = TreeNodeFromImplicitAllowedTypes<typeof Mode.schema>;
const node = new Mode.Bonus() as Mode;

switch (node.value) {
	case "Fun": {
		assert.fail();
	}
	case "Bonus": {
		// This one runs
		break;
	}
	default:
		// Before this change, "node.value" was never here, now "node" is never.
		unreachableCase(node);
}
```

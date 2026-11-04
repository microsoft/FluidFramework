# Tree API stability audit

Audit date: 2026-10-19.
Package version: 3.6.0.

This document records inconsistencies between the public, beta, and alpha API surfaces of `@fluidframework/tree`, along with examined differences that are not established defects.
It describes the source and API reports at the time of the audit, not changes that have been implemented.
Suggested directions below are not commitments to change the APIs.

## Scope and validation

The audit compared the [public](../api-report/tree.public.api.md), [beta](../api-report/tree.beta.api.md), and [alpha](../api-report/tree.alpha.api.md) API reports and traced the related source declarations and implementations.
The entry points are cumulative: no public export disappears from beta, and no beta export disappears from alpha.
Shared exported declarations are unchanged between these reports.
The identified API issues are in the relationships between separately named APIs, overridden methods, and their input and output types.
Different behavior for hydrated and unhydrated nodes is not, by itself, an API defect.

TypeScript consumer probes against the current source entry point confirmed the compile-time examples below.
Runtime probes against the existing built package confirmed the hydrated and unhydrated transaction behavior, with the relevant source implementations also inspected.
No production code was changed as part of the audit.
The full test suite was not run.

Findings are classified as:

- **Confirmed defect:** a type conversion or replacement API drops an existing capability, or behavior violates an established API contract.
- **Surface gap:** related APIs expose a capability at different stability levels or through different subsets of the surface.
- **Design asymmetry:** the difference is observable, but may be intentional and needs a design decision before it is treated as a defect.
- **Behavioral observation:** a verified difference that is not established as an issue and may support shared code across hydrated and unhydrated nodes.

## Findings

### 1. Alpha views drop beta and alpha-context transaction overloads

**Classification:** Confirmed defect.
**Relationship:** Beta view to alpha view, and alpha context to alpha view.

[UntypedTreeView](../src/simple-tree/api/tree.ts) exposes a single-`TValue` overload for value-returning callbacks and a general `TOut` overload that derives a result type from the callback return type.
It also exposes corresponding asynchronous overloads.
[TreeContextAlpha](../src/simple-tree/api/tree.ts) supports the single-`TValue` call shape.

`UntypedTreeViewAlpha` omits the beta transaction methods and declares two-type-parameter success/failure overloads and void overloads instead.
Its own declarations hide the context overloads.
`TreeViewAlpha` also omits the beta methods and inherits the reduced alpha overload set.

```typescript
import type {
	TreeContextAlpha,
	UntypedTreeView,
	UntypedTreeViewAlpha,
} from "@fluidframework/tree/alpha";

declare const betaView: UntypedTreeView;
declare const alphaView: UntypedTreeViewAlpha;
declare const context: TreeContextAlpha;

betaView.runTransaction<number>(() => ({ value: 42 })); // Compiles.
context.runTransaction<number>(() => ({ value: 42 })); // Compiles.
alphaView.runTransaction<number>(() => ({ value: 42 })); // Does not compile.

if (context.isView()) {
	context.runTransaction<number>(() => ({ value: 42 })); // Does not compile.
}
```

The same loss occurs with `runTransactionAsync`.
Generic forwarding code that uses the beta API's explicit `TOut` overload also cannot use that call unchanged on the alpha view.
Supplying both success and failure type arguments works for a value-returning alpha-view call, but does not preserve the existing overload set.

**Suggested direction:** Retain the beta/context call shapes when extending the transaction APIs with alpha options.
Add type tests for calls before and after `isView()` narrowing, explicit type arguments, generic forwarding, and both synchronous and asynchronous methods.

### 2. Context rollback behavior differs with hydration

**Classification:** Behavioral observation, not an established defect.
**Relationship:** View transaction capabilities versus the newer context APIs.

[TreeContextAlpha](../src/simple-tree/api/tree.ts) declares callbacks returning `WithValue<T>` or `void`, rather than the full view transaction-status types.
Actual rollback is a view-only capability: the documented path is to check `isView()` before relying on it.
The context callback types also accept a rollback request without a cast.

```typescript
const result = context.runTransaction(() => {
	node.n = 2;
	return { rollback: true, value: "cancelled" };
});
```

With an initial `node.n` of `1`, the runtime probes produced:

| Context | Result | Final `node.n` |
| --- | --- | --- |
| Hydrated | `{ success: false, value: "cancelled" }` | `1` |
| Unhydrated | `{ success: true, value: "cancelled" }` | `2` |

The asynchronous methods have the same difference.
[UnhydratedTreeContext](../src/shared-tree/unhydratedTreeContext.ts) wraps the callback result as success and never inspects `rollback`.
The [view implementation](../src/shared-tree/treeCheckout.ts) reads the rollback flag and aborts the transaction.

Unhydrated contexts do not merge edits and cannot roll back or revert transactions.
Ignoring controls that apply only to those operations can be useful: shared transaction code can operate on hydrated and unhydrated nodes without a special case for each.
The different results above verify the behavior but do not establish that ignoring the flag violates the intended context contract.
The beta context API has the same basic callback shapes and uses the same implementation.

**Contract question:** Clarify which callback controls common context code can supply and when code must use `isView()` to require actual rollback.
Review whether the callback types should describe those controls explicitly.
Do not require rejection merely because a control has no effect on an unhydrated node; that could remove useful compatibility.

### 3. Revert constraints do not apply to unhydrated contexts

**Classification:** Behavioral observation, not an established defect.
**Relationship:** View transaction capabilities versus context callbacks.

View transaction callbacks can return `preconditionsOnRevert`.
The context callback signatures do not explicitly expose that capability, but their void overload accepts callbacks returning such an object.

```typescript
context.runTransaction(() => ({
	preconditionsOnRevert: [
		{ type: "nodeInDocument", node: anUnhydratedNode },
	],
}));
```

A hydrated context validates this constraint and throws because the target node is not in the document.
An unhydrated context ignores it and returns `{ success: true }`.

The [view implementation](../src/shared-tree/treeCheckout.ts) reads and validates `preconditionsOnRevert`.
[UnhydratedTreeContext](../src/shared-tree/unhydratedTreeContext.ts) does not read that callback property.
It does validate the separate, initial `params.preconditions`; those must not be confused with constraints on revert.

Unhydrated nodes cannot be reverted and do not have view commit history.
Consequently, constraints on a future revert have no operation to constrain.
Ignoring them can let common transaction code supply the same metadata for both hydrated and unhydrated nodes without special cases.
The lack of validation in this case is not, by itself, a defect or missing functionality.

**Contract question:** Document which constraint checks apply to unhydrated contexts and preserve useful shared-code behavior.
Tests should cover both cases without assuming that they must produce identical results or reject irrelevant revert metadata.

### 4. Array and map alpha conversions lose existing types and subclass members

**Classification:** Confirmed defect.
**Relationship:** Public node to alpha node.

The array and map overloads of [asAlpha](../src/api.ts) do not reliably infer allowed types from schema-derived classes.

```typescript
import { asAlpha, SchemaFactory } from "@fluidframework/tree/alpha";

const sf = new SchemaFactory("audit");
class Numbers extends sf.array("Numbers", sf.number) {}

const numbers = new Numbers([]);
numbers.insertAtEnd(1); // Compiles.

const upgraded = asAlpha(numbers);
upgraded.insertAtEnd(1); // Does not compile.
```

The inferred upgraded array type is `TreeArrayNodeAlpha<ImplicitAllowedTypes, TreeNode | TreeLeafValue, never>`.
Reads lose their numeric type, and numeric insertion is rejected.
For a similarly constructed numeric map, conversion broadens reads and rejects numeric values passed to `set`.

Explicit schema type arguments, such as `asAlpha<typeof sf.number>(numbers)`, recover element typing.
However, both array and map conversions also discard custom subclass members and more-specific schema identity from their declared result types.

**Suggested direction:** Preserve the input node's existing type information while adding the alpha surface.

### 5. Configuring the alpha SharedTree kind hides alpha kind capabilities

**Classification:** Confirmed defect.
**Relationship:** Unconfigured alpha kind to configured alpha kind.

[SharedTreeAlpha](../src/treeFactory.ts) is typed as `SharedObjectKindAlpha<ITree>`.
`configuredSharedTreeAlpha`, in the same file, returns only `SharedObjectKind<ITree>`.

As a result, configuring the alpha kind, even with `{}`, hides the `type` and `adapt` members.
Assigning the configured result to `typeof SharedTreeAlpha` fails.
The implementation already returns an alpha-capable kind; its public declaration drops that information.

**Suggested direction:** Expose the alpha kind type from the alpha configuration function.

### 6. Public node metadata has uneven factory support

**Classification:** Surface gap.
**Relationship:** Public metadata options versus public, beta, and alpha factories.

[NodeSchemaOptions and NodeSchemaMetadata](../src/simple-tree/api/schemaFactory.ts) are public, but the factory options that let you attach node metadata are not consistently available.

| Factory level | Object | Array and map | Record |
| --- | --- | --- | --- |
| Public | No options argument | No options argument | Not available |
| Beta | Metadata options supported | No options argument | Metadata options supported |
| Alpha | Supported through alpha methods | Supported through alpha methods | Supported |

For example, [SchemaFactoryBeta](../src/simple-tree/api/schemaFactoryBeta.ts) accepts a metadata options argument on `object` and `record`.
Its inherited array and map overloads reject that argument.
The alpha factory's `arrayAlpha` and `mapAlpha` methods accept it.

This is incomplete promotion or configuration support, rather than a removed overload.
The public metadata types and output properties do not provide a corresponding public factory input path.

**Suggested direction:** Review the promotion as one feature and make node metadata configuration consistent across node kinds.

### 7. Beta transaction labels require alpha APIs to read them

**Classification:** Surface gap.
**Relationship:** Beta transaction input to alpha-only metadata output.

[RunTransactionParamsBeta.label](../src/simple-tree/api/transactionTypes.ts) lets beta consumers attach a label to a transaction.
However, [ChangeMetadataBeta](../src/core/rebase/types.ts) exposes neither `label` nor `labels`.
Those properties are exposed by the alpha `LocalChangeMetadata` interface.

A beta-only consumer can attach a label but cannot read it from the beta changed event to perform the documented correlation or grouping.

**Suggested direction:** Align the stability of the label input with the metadata needed to use it, or document the alpha dependency explicitly.

### 8. The alpha identifier factory accepts only public field options

**Classification:** Surface gap.
**Relationship:** Alpha identifier fields versus other alpha fields.

[SchemaFactoryAlpha.identifier](../src/simple-tree/api/schemaFactoryAlpha.ts) uses an [implementation signature](../src/simple-tree/api/schemaStatics.ts) whose options are `Omit<FieldProps<TCustomMetadata>, "defaultProvider">`.
It does not use `FieldPropsAlpha`.

Consequently, alpha `required` and `optional` fields accept options such as `persistedMetadata` and `summarizeIncrementally`, but the alpha identifier factory rejects those options.

**Suggested direction:** Review which alpha field options apply to identifiers and expose those consistently.

### 9. Recursive alpha factories return less-capable types than nonrecursive alpha factories

**Classification:** Surface gap.
**Relationship:** Recursive and nonrecursive alpha schema construction.

The [alpha factory](../src/simple-tree/api/schemaFactoryAlpha.ts) has these differences:

- `arrayRecursive` returns nodes without the alpha methods exposed by `arrayAlpha`, such as `pop`.
- `mapRecursive` returns nodes without the alpha methods exposed by `mapAlpha`, such as `clear`.
- `recordRecursive` accepts `persistedMetadata`, but its returned schema type does not expose that property, unlike `recordAlpha`.

The [unsafe schema result types](../src/simple-tree/api/typesUnsafe.ts) for recursive arrays and maps use the stable node surfaces.
The recursive record method returns a general schema type without the richer simple-schema surface.

Recursive schemas need relaxed type constraints.
That requirement does not by itself explain why the returned types must also lose these unrelated alpha capabilities.

**Suggested direction:** Preserve the relevant alpha node and schema APIs in recursive result types where TypeScript permits it, and document any unavoidable limitations.

### 10. Alpha conversion helpers do not cover several existing API pairs

**Classification:** Design asymmetry.
**Relationship:** Public or beta interfaces with corresponding alpha interfaces.

[asAlpha](../src/api.ts) has no overloads for:

- `UntypedTreeView` to `UntypedTreeViewAlpha`.
- `TreeContextBeta` to `TreeContextAlpha`.
- `Revertible` to `RevertibleAlpha`.

You can obtain some of these alpha interfaces through other paths, such as `TreeAlpha.context(node)` and alpha change metadata.
However, an existing value does not have the same direct conversion path offered for typed views, tree instances, configurations, arrays, and maps.

This is a coverage gap, not proof that an identity conversion is valid for every implementation.
The helper's source explicitly requires that all accepted implementations support the corresponding alpha interface.

**Suggested direction:** Decide which conversions can meet that guarantee and add those overloads, or document why a different access path is required.

### 11. The Tree utility singletons are not a capability ladder

**Classification:** Design asymmetry.
**Relationship:** Beta and alpha utility companions.

[TreeAlpha](../src/shared-tree/treeAlpha.ts) repeats several beta utilities but does not expose `clone`, which is available on [TreeBeta](../src/shared-tree/treeBeta.ts).
Code cannot switch to the alpha singleton and assume it retains the beta companion's utilities.

The singletons are documented as extensions to `Tree`, not replacements for it.
Therefore, this difference is not automatically a defect, and the absence of every public `Tree` method from the companions is not itself an audit finding.
The asymmetry is that some beta utilities are repeated on the alpha companion while others are not.

**Suggested direction:** Choose and document a consistent composition model for these companions.
If they are intentionally separate extensions, make that clear rather than suggesting that the alpha singleton is a superset.

---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Mask or reserve implementation properties on subclassable erased schemas

The Alpha APIs `eraseSchemaDetailsSubclassable` and `ErasedSchemaSubclassable` now accept an optional third type argument for instance-member masking or reservations.
Erasing a member's type does not remove it at runtime, so subclasses can otherwise overwrite hidden fields or methods, or collide with getters.
Existing calls remain unchanged unless you opt in.

Use the new Alpha type `MaskedProperties<"content" | "rangeStorage">` as the third type argument to expose these properties as optional and read-only, with `unknown` values.
This rejects direct writes through the masked type without assuming that a property exists or holds an object.
Masked properties remain visible, and subclass overrides are still allowed.
TypeScript's `noImplicitOverride` option does not require an `override` modifier for these mapped properties.
To prevent conflicting subclass declarations, pass a named class with TypeScript-private members instead.

```typescript
declare class PrivateReservations {
	private content: unknown;
	private rangeStorage: unknown;
}

const Base = eraseSchemaDetailsSubclassable<
	PublicMembers,
	PublicStatics,
	PrivateReservations
>()(InternalSchema);
```

Keep reservation classes outside exported factory functions.
If you annotate a factory's return type, pass the same reservation type to `ErasedSchemaSubclassable` to preserve the checks.
Reservations do not change runtime behavior and cannot prevent JavaScript callers or type assertions from bypassing the restrictions.
Prefer JavaScript-private (`#`) members or non-exported symbols for implementation details where possible, because they avoid collisions without reserving public names.

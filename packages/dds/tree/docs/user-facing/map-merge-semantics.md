# Merge Semantics of Edits on Map Nodes

This document describes the semantics of edits that can be performed on map nodes.

Target audience: `SharedTree` users and maintainers.

> While this document is self-contained, we recommend reading about [SharedTree's approach to merge semantics](merge-semantics) first.

Each edit's merge semantics is defined in terms of its preconditions and postconditions.
A precondition defines a requirement that must be met for the edit to be valid.
(Invalid edits are ignored along with all other edits in same transaction, and postconditions do not hold)
A postcondition defines a guarantee that is made about the effect of the edit.

## `set(key: string, value: T): void`

Updates the value associated with the given key.

```typescript
users.set("bob", new User({ id: "bob", email: "bob@contoso.com" });
```

```typescript
parts.set("bolt", 42);
```

Preconditions:
* There is no schema change edit that the `set` edit is both concurrent to and sequenced after.
* If the new value is an internal node (i.e., an object, map, or array), that node has never been part of the document tree before.
  (This precondition will be removed soon)

Postconditions:
* The value associated with the key is the value passed to the `set` call.

## `delete(key: string): void`

Clears any value associated with the given key.

```typescript
users.delete("bob");
```

Preconditions:
* There is no schema change edit that the `delete` edit is both concurrent to and sequenced after.

Postconditions:
* There is no longer a value associated with the given key.
  Note: this will remove whatever value (if any) is associated with the key,
  even if that value was changed by concurrent edits that were sequenced earlier.

## Noteworthy Implications

* The `set` and `delete` operations are effective even when the map whose being updated has been removed.
* If multiple edits concurrently set the same field, then the field's final value will will be that of the edit that is sequenced last.
  In other words, the `set` operation has last-write-wins semantics.
* If user A calls `map.set("key", 42)` and user B concurrently calls `map.delete("key", 42)` on same map node,
  then the outcome depends on the arbitrary ordering that is imposed by the sequencing service:
  If the `delete` call is ordered before the `set` call, then the `set` will win out, setting the new associated value for that key.
  If the `set` call is ordered before the `delete` call, then the `delete` will win out, clearing the associated value for that key.

This last point means that one user may end up deleting a value they have never seen.
Consider the following scenario:
* Starting state: `map.get("key")` is equal to `"foo"`
* Client A wants to replace the value `"foo"` with the value `"bar"` so they call `map.set("key", "bar")`.
* Client B wants to delete the value `"foo"` so they call `map.delete("key")`.

If these two edits are made concurrently,
and if client A's edit is sequenced before client B's edit,
then client B's edit will end up removing the value `"bar"`.
This is typically acceptable, but in cases where it proves problematic,
it's possible to put the `delete` operation in a transaction with a constraint that ensures the value to be deleted is still in the tree.

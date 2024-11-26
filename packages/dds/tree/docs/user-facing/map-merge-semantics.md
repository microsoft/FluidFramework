# Merge Semantics of Edits on Map Nodes

This document describes the semantics of edits that can be performed on map nodes.

Target audience: `SharedTree` users and maintainers.

> While this document is self-contained, we recommend reading about [SharedTree's approach to merge semantics](merge-semantics) first.

Each edit's merge semantics are defined in terms of the edit's preconditions and postconditions.
A precondition defines a requirement that must be met for the edit to be valid.
A postcondition defines a guarantee that is made about the effect of the edit.
(Invalid edits are ignored along with all other edits in the same transaction, and postconditions do not hold).

## `set(key: string, value: T): void`

Updates the value associated with the given key.

Examples:
```typescript
users.set("bob", new User({ id: "bob", email: "bob@contoso.com" });
```

```typescript
partCounts.set("bolts", 42);
```

Preconditions:
* There is no concurrent schema change edit that is sequenced before the `set` edit.
* The value on the right side of the `=` operator must have status `TreeStatus.New` or be a primitive.
  (This precondition will be removed soon)

Postconditions:
* The given value is now associated with the given key.
* The value (if any) that was associated with the given key immediately prior to the application of the edit is removed (its status becomes `TreeStatus.Removed`).

## `delete(key: string): void`

Clears any value associated with the given key.

```typescript
users.delete("bob");
```

Preconditions:
* There is no concurrent schema change edit that is sequenced before the `delete` edit.

Postconditions:
* There is no longer any value associated with the given key.
  The value (if any) that was associated with the given key immediately prior to the application of the edit is removed (its status becomes `TreeStatus.Removed`).
  Note: this will remove whatever value is associated with the key,
  even if that value was changed by concurrent edits that were sequenced earlier.

Removed items are saved internally for a time in case they need to be restored as a result of an undo operation.
Changes made to them will apply despite their removed status.

## Additional Notes

### Operations on Removed Maps

All of the above operations are effective even when the targeted map has been moved or removed.

### Last-Write-Wins Semantics

If multiple edits concurrently set the same key, then the key's final value will be that of the edit that is sequenced last.
In other words, the `set` operation has last-write-wins semantics.

Note that this means one user may overwrite a value set by another user without realizing it.
This is identical to the semantics of the `=` operator on object nodes.
Refer to its [Last-Write-Wins Semantics section](./object-merge-semantics.md#last-write-wins-semantics) for more details.

### Delete Clears Whichever Value is Present

If user A calls `map.set("key", 42)` and user B concurrently calls `map.delete("key", 42)` on same map node,
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

### Removing and Re-inserting Nodes

When dealing with plain JavaScript maps,
it is possible to move items around by removing them and adding them back in.
For example, if some node N needs to be moved from `mapA` to `mapB`,
that can accomplished with the following operations:
```typescript
const N = mapA.get(key);
mapA.delete(key); // Remove node N from mapA
mapB.set(key, N); // Insert node N into mapB
```

Similarly, plain JavaScript maps allow moving a value from one key to another within the same map:
```typescript
const N = mapA.get("foo");
mapA.delete("foo"); // Remove node N from mapA/key "foo"
mapA.set("bar", N); // Insert node N into mapA/key "bar"
```

As of October 2024, SharedTree maps do not support these patterns because it would require (re)inserting node N, which has previously been inserted.
Note that even without this restriction, the above would not perform the desired change if some other user concurrently moved N from `mapA` to some other `mapC`.
If that were the case...
* Node N may no longer be in `mapA` by the time the edit `mapA.delete(key)` is applied.
  At best that edit would have no effect, and at worst it may inadvertently remove some other node.
* Node N may still be in `mapC` by the time the edit `mapB.set(key, N)` is applied.
  If so, this would lead to an error since a single node cannot reside in multiple maps at the same time.
  (This would violate the requirement that the document remains tree-shaped).

Work is underway to address this lack of flexibility.

### Clearing The Map

As of October 2024, there is no support for clearing the whole map in one operation.
If you find yourself wishing for such an operation, please reach out to the Fluid team.

Note that one client can, in a transaction, iterate through all existing key and use the `delete` operation on each of them.
This does not however guarantee that the map will be empty after the transaction is applied
because other users may have concurrently added entries to new keys.
This approach is also much less efficient than a `clear` operation would be since it needs to transmit the set of existing key over the network.
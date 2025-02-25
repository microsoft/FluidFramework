# Merge Semantics of Edits on Object Nodes

This document describes the semantics of edits that can be performed on object nodes.

Target audience: `SharedTree` users and maintainers.

> While this document is self-contained, we recommend reading about [SharedTree's approach to merge semantics](merge-semantics) first.

Each edit's merge semantics are defined in terms of the edit's preconditions and postconditions.
A precondition defines a requirement that must be met for the edit to be valid.
A postcondition defines a guarantee that is made about the effect of the edit.
(Invalid edits are ignored along with all other edits in the same transaction, and postconditions do not hold).

## Operator `=`

Assigning a value to the property on an object node updates the value associated with that property on the object.

Examples:

```typescript
rectangle.topLeft = new Point({ x: 0, y: 0 });
```

```typescript
babyShowerNote.author = "The Joneses";
```

Optional properties can be cleared by assigning `undefined` to them.

```typescript
proposal.text = undefined;
```

Preconditions:
* There is no concurrent schema change edit that is sequenced before the property assignment edit.
* The value on the right side of the `=` operator must have status `TreeStatus.New` or be a primitive.
  (This precondition will be removed soon)

Postconditions:
* The value that was on the right hand side of the `=` operator is now associated with the targeted property.
* The value (if any) that was associated with the object property immediately prior to the application of the edit is removed (its status becomes `TreeStatus.Removed`).

Removed items are saved internally for a time in case they need to be restored as a result of an undo operation.
Changes made to them will apply despite their removed status.

## Additional Notes

### Operations on Removed Objects

All of the above operations are effective even when the targeted object has been moved or removed.

### Last-Write-Wins Semantics

If multiple edits concurrently edit the same field,
then the field's final value will will be that of the edit that is sequenced last.
In other words, property assignment has last-write-wins semantics.

Note that this means one user may overwrite a value set by another user without realizing it.
Consider the following scenario:
Alice and Bob are editing a document that contains sticky notes whose background color can be changed.
Alice changes the background color of one sticky note from yellow to red,
while Bob concurrently changes the background color of one sticky note from yellow to blue.
The sequencing is such that Bob's edit is sequenced after Alice's edit.

![Bob's edit overwrites Alice's edit](https://storage.fluidframework.com/static/images/blue-over-red.png)<br />
_A: Bob receives Alice's edit.
Since Bob's client has yet to receive his own edit back from the sequencing service,
Bob's client can deduce that his edit is sequenced later and therefore wins out over Alice's.
This means the color property can remain blue.<br />
B: Alice receives Bob's edit.
Even though the edit was originally created in a context where it changed the color from yellow to blue,
the edit now changes the color red to blue._

Such overwriting is rare in application where users are given visual cues as to what data other users may be concurrently inspecting/editing.
It's possible to prevent such overwrites by using constraints (effectively changing the semantics to first-write-wins),
but note that this causes the the later edit to be dropped,
and the data associated with it to be lost.

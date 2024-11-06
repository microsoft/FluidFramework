# Merge Semantics of Edits on Object Nodes

This document describes the semantics of edits that can be performed on object nodes.

Target audience: `SharedTree` users and maintainers.

> While this document is self-contained, we recommend reading about [SharedTree's approach to merge semantics](merge-semantics) first.

Each edit's merge semantics is defined in terms of its preconditions and postconditions.
A precondition defines a requirement that must be met for the edit to be valid.
(Invalid edits are ignored along with all other edits in same transaction, and postconditions do not hold)
A postcondition defines a guarantee that is made about the effect of the edit.

## Property Assignment

Assigning a value to the property on an object node updates the value associated with that property on the object.
This is done using the assignment operator (`=`).

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
* There is no schema change edit that the property assignment edit is both concurrent to and sequenced after.
* If the new value is an internal node (i.e., an object, map, or array), that node has never been part of the document tree before.
  (This precondition will be removed soon)

Postconditions:
* The property's value is the value that was on the right hand side of the `=` operator.

## Noteworthy Implications

* A property assignment edit is effective even when the object whose property is being assigned to has been removed.
* If multiple edits concurrently edit the same field, then the field's final value will will be that of the edit that is sequenced last.
  In other words, property assignment has last-write-wins semantics.

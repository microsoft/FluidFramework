# Merge Tree Obliterate

This document covers motivation, spec, and potential design for the upcoming "obliterate" feature of merge-tree.

## Context

A concise description of merge-tree's current merge conflict resolution strategy is as follows:

- Insertion of a text segment only conflicts with other insertions at the same location.
  The conflict is resolved by inserting the segment added later nearer in the string.
  For example, from an initial state of "abc", if the operations [insert "hi " at 0] from client 1
  and [insert "bye " at 0] from client 2 are sequenced in that order, the resulting state is "bye hi abc".
- Range operations (delete, annotate) apply to the range at the time the operation was issued.
  Specifically, insertion of a segment into a range that is concurrently deleted or annotated
  will not result in that inserted segment being deleted or annotated. For example, from an initial state "012",
  the operations [delete the range [1, 3)] from client 1 and [insert "hi" at index 2 (i.e. between "1" and "2")] from client 2,
  the resulting text is "0hi".

The merge outcomes for ranges are easy to understand, but not always desirable.
Oftentimes, when consumers want to work with ranges, they may want their operation to apply to concurrently inserted segments.
One set of implemetable semantics would be rather than the range operation applying to a range of character positions at the
time the operation is issued, it applies at the time the operation is sequenced.
From an initial state of "012" at sequence number 0, the operations:

```
seq: 1 [insert "hi" at index 2, refSeq: 0]
seq: 2 [delete the range [1, 3), refSeq: 0]
```

would result in the text "0". However, if those concurrent operations were sequenced in the opposite order:

```
seq: 1 [delete the range [1, 3), refSeq: 0]
seq: 2 [insert "hi" at index 2, refSeq: 0]
```

we'd still end up with the text "0hi".

One option is even more extreme: not only does the range operation apply to the range at the time the op is sequenced,
it also applies to any subsequent segments that get concurrently inserted into this range.
Under these semantics, both orders of sequencing the above operations would result in the text "0".

# Interval Stickiness

### Background

"Stickiness" refers to the behavior of intervals when text is inserted on either side of the interval. A "sticky" interval is one which expands to include text inserted directly adjacent to it.

A "left sticky" interval is one which expands only to include text inserted to the left of it. A "right sticky" interval is the same, but with regard to text inserted on the right.

For example, let's look at the string "abc". If we have an interval on the character "b", what happens when we insert text on either side of it? In the below diagrams, we represent an interval by putting a caret directly underneath the characters it contains.

##### Original string:

```
abc
 ^
```

##### No stickiness:

```
aXbYc
  ^
```

The interval does not expand to include the newly inserted characters `X` and `Y`.

##### Left stickiness:

```
aXbYc
 ^^
```

##### Right stickiness:

```
aXbYc
  ^^
```

##### Stickiness:

```
aXbYc
 ^^^
```

Today, intervals support both no-stickiness and right-stickiness in the case of insertion, and right-stickiness in the case of deletion.

If users treat bounds as being inclusive, then intervals have no stickiness when text is inserted.

Right-stickiness can be accurately modeled for insertion by treating the rightmost bound as exclusive. That is, if we model the interval `[1, 2]` as `[1, 3)`, users can actually get the expected behavior of right-stickiness. If we write this as an ASCII diagram where exclusive bounds are represented by a `+`,

```
abcdef
 ^^+
```

We start with an interval over `[bcd)`. If we then insert text after `c`, we get

```
abcXdef
 ^^^+
```

This works today because the newly inserted segment _does_ actually fall within the bounds of the interval, and after insertion, the end bound of the right interval slides to the next farthest segment, expanding the interval to `[1, 4)` or `[bcXd)`.

This same trick does work for left-stickiness when we only consider insertion, but breaks down in the case of removal. An example of this is:

If we take the diagram of the range `(1, 3]`

```
abcdef
 +^^
```

and we delete the character `b`, the interval bound today will slide to the right, shrinking the interval.

```
acdef
 +^^
```

The expected behavior would be for the bound to slide to the character `a`.

#### "Left" and "Right"

"Left" and "right" in the context of text can be confusing, as some scripts are written right-to-left. For the purposes of this document, left/forward/near are all synonyms referring to text that is closer to the start of the string, and right/backward/far are synonyms referring to text that is closer to the end of the string.

### Detailed Design

The implementation work is largely straightforward. In order to get the correct left-sticky behavior in the face of removal, we just have to modify local reference sliding to prefer sliding to the left when the reference is the start-bound of a left-sticky interval. Just changing the order of traversal when looking for slid-to-segments is sufficient to implement this change and make left-stickiness tests pass.

#### String Endpoints

Exclusive bounds raise the problem of spanning over the start and end characters of the string. That is, if we convert an inclusive range `[0, 1]` to an exclusive, left-sticky range, the leftmost range bound must become negative: `(-1, 1]`. This is not supported today. The proposed solution is to have a marker segment that always lives at the start of the string.

There is prior art here in existing implementations of right-stickiness that insert a marker segment that always lives at the end of the string.

This document proposes to make both start-of-string and end-of-string markers that can be referred to by intervals a first class concept. An `EndOfTreeSegment` structure exists in `merge-tree` today, and can be used to implement such an end-of-string marker for right-sticky intervals. A similar structure should be created for `StartOfTreeSegment`.

#### Stickiness as a First Class Concept

Although it is possible to implement right-stickiness today, doing so requires manual tracking of whether a bound is exclusive or inclusive. With the addition of leftmost exclusive bounds to support full- and left- stickiness, this tracking becomes significantly more complex for the end user.

This document proposes adding first class support for declaring intervals as left/right/full/not sticky. This can be achieved by adding a field to intervals that tracks the interval stickiness and updating some methods to be aware of this new functionality.

Notably, methods that have to be updated are:

1. Methods that check for overlapping intervals should not return true where the overlap is the exclusive bound
2. Methods that map or traverse the tree should not include segments contained in exclusive bounds

#### API

Word has asked that it be possible to configure interval stickiness on both a per-interval and per-collection basis.

MergeTree already supports configuration of features on a per-collection basis through the options field. This field is already used by attribution and so makes sense to reuse it for interval stickiness.

By default, intervals will have no stickiness. MergeTree options allow configuring of this default. If an interval has a stickiness value, this will override the collection default. I.e. `interval.stickiness ?? collection.stickiness ?? no stickiness`.

Local references contain a pointer to the segment they reference, a character offset within the segment, and an optional properties object. In order to support interval stickiness, local references that are part of intervals need to keep track of whether they should slide to the left or the right.

This document proposes adding an optional field on `ReferencePosition`, `slidingPreference?: SlidingPreference` where `SlidingPreference` is an enum with two variants.

```ts
enum SlidingPreference {
	Left,
	Right,
}
```

If the sliding preference is left, the segment will first do a forward traversal when sliding, and if right it will do a backwards traversal first.

Stickiness is an enum with four variants,

```ts
enum IntervalStickiness {
	/**
	 * Interval expands to include segments inserted adjacent to the left
	 */
	Left,

	/**
	 * Interval expands to include segments inserted adjacent to the right
	 */
	Right,

	/**
	 * Interval expands to include all segments inserted adjacent to it
	 */
	Full,

	/**
	 * Interval does not expand to include adjacent segments
	 */
	None,
}
```

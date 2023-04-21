# IntervalCollection Querying

This document outlines a design for improving `IntervalCollection`'s query APIs.

Briefly, the goal is to support our current APIs (where we deem them useful) as well as the following queries in a pay-to-play way:

-   `findOverlappingIntervals(start: number, end: number): Iterable<SequenceInterval>`
-   `findIntervalsWithStartInRange(start: number, end: number): Iterable<SequenceInterval>`
-   `findIntervalsWithEndInRange(start: number, end: number): Iterable<SequenceInterval>`

Notably, each of these APIs requires bookkeeping a spatial index of intervals which is only useful to support application queries.
This incurs runtime cost and code bloat for applications which only use a subset of the APIs.

The general strategy for achieving this goal splits into a few parts:

1. Characterize `IntervalCollection` public APIs into operations and queries.
1. Refactor `IntervalCollection`'s implementation to better compartmentalize its queries into indexing objects. Since it is already a light wrapper over LocalIntervalCollection (which is unexposed), this step doesn't need to affect the public API.
1. Move query-based public APIs to an object created using an IntervalCollection
1. Make the set of query APIs injectable by application authors

## `IntervalCollection` API Overview

The current public API for IntervalCollection (ignoring methods marked internal) is shown below:

```typescript
export class IntervalCollection<TInterval extends ISerializableInterval> extends TypedEventEmitter<
	IIntervalCollectionEvent<TInterval>
> {
	[Symbol.iterator](): IntervalCollectionIterator<TInterval>;
	add(start: number, end: number, intervalType: IntervalType, props?: PropertySet): TInterval;
	addConflictResolver(conflictResolver: IntervalConflictResolver<TInterval>): void;
	attachDeserializer(onDeserialize: DeserializeCallback): void;
	get attached(): boolean;
	change(id: string, start?: number, end?: number): TInterval | undefined;
	changeProperties(id: string, props: PropertySet): void;
	CreateBackwardIteratorWithEndPosition(
		endPosition: number,
	): IntervalCollectionIterator<TInterval>;
	CreateBackwardIteratorWithStartPosition(
		startPosition: number,
	): IntervalCollectionIterator<TInterval>;
	CreateForwardIteratorWithEndPosition(
		endPosition: number,
	): IntervalCollectionIterator<TInterval>;
	CreateForwardIteratorWithStartPosition(
		startPosition: number,
	): IntervalCollectionIterator<TInterval>;
	findOverlappingIntervals(startPosition: number, endPosition: number): TInterval[];
	gatherIterationResults(
		results: TInterval[],
		iteratesForward: boolean,
		start?: number,
		end?: number,
	): void;
	getIntervalById(id: string): TInterval | undefined;
	map(fn: (interval: TInterval) => void): void;
	nextInterval(pos: number): TInterval | undefined;
	previousInterval(pos: number): TInterval | undefined;
	removeIntervalById(id: string): TInterval | undefined;
}
```

This API splits roughly into operations and queries as follows:

```typescript
export class IntervalCollection<TInterval extends ISerializableInterval> extends TypedEventEmitter<
	IIntervalCollectionEvent<TInterval>
> {
	add(start: number, end: number, intervalType: IntervalType, props?: PropertySet): TInterval;
	addConflictResolver(conflictResolver: IntervalConflictResolver<TInterval>): void;
	attachDeserializer(onDeserialize: DeserializeCallback): void;
	change(id: string, start?: number, end?: number): TInterval | undefined;
	changeProperties(id: string, props: PropertySet): void;
	removeIntervalById(id: string): TInterval | undefined;
}

export class IntervalCollectionQueryMethods<TInterval extends ISerializableInterval> {
	[Symbol.iterator](): IntervalCollectionIterator<TInterval>;
	get attached(): boolean;
	CreateBackwardIteratorWithEndPosition(
		endPosition: number,
	): IntervalCollectionIterator<TInterval>;
	CreateBackwardIteratorWithStartPosition(
		startPosition: number,
	): IntervalCollectionIterator<TInterval>;
	CreateForwardIteratorWithEndPosition(
		endPosition: number,
	): IntervalCollectionIterator<TInterval>;
	CreateForwardIteratorWithStartPosition(
		startPosition: number,
	): IntervalCollectionIterator<TInterval>;
	findOverlappingIntervals(startPosition: number, endPosition: number): TInterval[];
	gatherIterationResults(
		results: TInterval[],
		iteratesForward: boolean,
		start?: number,
		end?: number,
	): void;
	getIntervalById(id: string): TInterval | undefined;
	map(fn: (interval: TInterval) => void): void;
	nextInterval(pos: number): TInterval | undefined;
	previousInterval(pos: number): TInterval | undefined;
}
```

The placement of "events" in this split doesn't matter too much, and they're arguably their own category.
For practical purposes, a few of the APIs might be better left on interval collection--`attached`, `[Symbol.iterator]`, and `map`.

## Splitting IntervalCollection into indexes

Each query API above requires some particular indexing of the set of intervals to operate efficiently.
[This commit](https://github.com/microsoft/FluidFramework/commit/01f20ee48198cd18011caa112f134c4ff337a8aa) shows an example factoring of `LocalReferenceCollection` into 3 parts.
The key idea is the interval index interface:

```typescript
/**
 * Collection of intervals.
 *
 * Implementers of this interface will typically implement additional APIs to support efficiently querying a collection
 * of intervals in some manner, for example:
 * - "find all intervals with start endpoint between these two points"
 * - "find all intervals which overlap this range"
 * etc.
 */
export interface IntervalIndex<TInterval extends ISerializableInterval> {
	/**
	 * Adds an interval to the index.
	 * @remarks - Application code should never need to invoke this method on their index for production scenarios:
	 * Fluid handles adding and removing intervals from an index in response to sequence or interval changes.
	 */
	add(interval: TInterval): void;
	/**
	 * Removes an interval from the index.
	 * @remarks - Application code should never need to invoke this method on their index for production scenarios:
	 * Fluid handles adding and removing intervals from an index in response to sequence or interval changes.
	 */
	remove(interval: TInterval): void;
}
```

The 3 parts correspond to query APIs which depend on the minmax interval tree, the endpoint interval tree, and the id-to-interval map.

Indexes can store data as is convenient, but must support addition and removal of that data.
This keeps details about interval comparators being mutable internal to `LocalIntervalCollection`.

Another nice feature of factoring the code this way is it increases testability: correctness for spatial aspects of each index can be verified using numeric intervals and without spinning up any DDS infrastructure.

## Changing Public Query APIs

After the internals more closely reflect our desired code factoring, the public API should follow.
If we take the commit from the previous section, this would mean refactoring `IntervalCollection` to have a shape resembling

```typescript
export class IntervalCollection<TInterval extends ISerializableInterval> extends TypedEventEmitter<
	IIntervalCollectionEvent<TInterval>
> {
	indexes: {
		id: IIntervalIdIndex<TInterval>;
		overlappingIntervals: IOverlappingIntervalsIndex<TInterval>;
		matchingEndpoints: IMatchingEndpointsIndex<TInterval>;
	};
	add(start: number, end: number, intervalType: IntervalType, props?: PropertySet): TInterval;
	addConflictResolver(conflictResolver: IntervalConflictResolver<TInterval>): void;
	attachDeserializer(onDeserialize: DeserializeCallback): void;
	change(id: string, start?: number, end?: number): TInterval | undefined;
	changeProperties(id: string, props: PropertySet): void;
	removeIntervalById(id: string): TInterval | undefined;
}

export interface IIntervalIdIndex<TInterval extends ISerializableInterval>
	extends IntervalIndex<TInterval>,
		Iterable<TInterval> {
	getIntervalById(id: string): TInterval | undefined;
}

export interface IOverlappingIntervalsIndex<TInterval extends ISerializableInterval>
	extends IntervalIndex<TInterval> {
	CreateBackwardIteratorWithEndPosition(
		endPosition: number,
	): IntervalCollectionIterator<TInterval>;
	CreateBackwardIteratorWithStartPosition(
		startPosition: number,
	): IntervalCollectionIterator<TInterval>;
	CreateForwardIteratorWithEndPosition(
		endPosition: number,
	): IntervalCollectionIterator<TInterval>;
	CreateForwardIteratorWithStartPosition(
		startPosition: number,
	): IntervalCollectionIterator<TInterval>;
	findOverlappingIntervals(startPosition: number, endPosition: number): TInterval[];
	gatherIterationResults(
		results: TInterval[],
		iteratesForward: boolean,
		start?: number,
		end?: number,
	): void;
}
```

Note: we probably don't want to check this step in directly,
as ideally we should only need to break the public API once to reach our desired state.
Making the set of indexes customizable will involve changing the type of "indexes" above.

## Making supported indexes customizable

Finally, the supported set of indexes should be injected by the application author.
One option in this realm is to use a registration system at DDS creation time, but that gets [quite involved](https://www.typescriptlang.org/play?ts=4.7.4#code/JYOwLgpgTgZghgYwgAgJLmgNzgG3QEwgA8AeAFXUimxwD5kBvAWAChl3k598AKUKmgC5kFDNVwBKYZgD2wfAG5WHZFAgBbGZgh8xQkZSyTpcxawC+rVgHpryACIBXdeoCeyMK4AOEAM6tPH2QAZQgAR0cIECRDcRxkAF5kEGcAI2glFn5oeCRkAGEcYCiwRksssVyUVAAJCBwfKF8yqxZA6r1cAmIAMUQwGShXcliaeiSeBCKS4ULi8AAaZAALesbfYVq16F8JRPpRrpBCUlEBXFpW9rROvGPiACUIAHNgXzAhkdvx5CeuGRAOFcAEEoFA4MM1P9Ae4ANrvKCgZ5LQ53E59BADT5nIx0AC6lxYrCmcF8zQA8tooDg4F4vEjUd1Tqj6MB1F4cBoSs1Gfdmd9GMoOF5HKkighkG4AIqRIbAgAKqB4UmSaWgjFUEDAjigIGQAFYFMhyioRWLgBKuLw9gwTcLReLNZptMqWixyqwYI5omBgADkAgoZBKdAaXSGbcmZNpuBZjGwEtVg0dps6smmiqQ9TafSQM9eScSKEIlEYgLmGwOGptbrkhAAO7ILNh3P5yN85WZD0sBAA96a14I9xJWGwgDkWlDOaRY6WgYgcGDVJbEfOaOIeLxnGavZA72JfdKqU27ZOT0HH2Gxci0QgLMSA7el8yNjsZDgAGs-B5VgHD3BwEfIcPG8FA4FSScPBkH8UGuBhkEnbNwzzYRm2nPMC2IItwhvMs13ocwADoAlAm4zwgXsoHwHooBkdRzyfbFUSWURyIvIZkGISBjh5U9HheRjhhxOJaB+CsVFhABpZBQGQL9XBkGADD5BjgNJZBpK4qJ8GaFJ1HSKBkAAfmUtjBKkvFYQABi3YQQAgKk8WEJ4axAMhQK+Myhws2EAEYCS7VoSTJG413yGQcE5TE-RAL41xYplVMvTiiG4nTQtxRKBKHOLcVEwVK3YUATj8E9yMo6jaPo7LL1yuIEpUmqhh+b1CBgUAIHwbdOBAVxAqJFgvR9GLkGeLVUXCyKKN9AESCFdhWP49j3C0niMriLLluwktbxZVhaB4ebkBpdIcGEBEkQWI7iuIUrTKWwTWBVCaIqimbYuvUs71uBqvMvehxKrLUdT1VqIHa+yuvUgC+osILDz-Kbov9JIxrAF6kfengACJexcblsaWNRlokTJe0xmLCJuog-EIxCVzzQjpVlEFFVYIA).

A simpler alternative which is also more flexible would involve punting the storage problem to the application.
Specifically, IntervalCollection could support the following APIs:

```typescript
export class IntervalCollection<TInterval extends ISerializableInterval> {
	/**
	 * Attaches an index to this collection.
	 * All intervals which are part of this collection will be added to the index, and the index will automatically
	 * be updated when this collection updates due to local or remote changes.
	 *
	 * @remarks - After attaching an index to an interval collection, applications should typically store this
	 * index somewhere in their in-memory data model for future reference and querying.
	 */
	attachIndex(index: IntervalIndex<TInterval>): void;
	/**
	 * Detaches an index from this collection.
	 * All intervals which are part of this collection will be removed from the index, and updates to this collection
	 * due to local or remote changes will no longer incur updates to the index.
	 */
	detachIndex(index: IntervalIndex<TInterval>): boolean;
}
```

This would let the application easily pick-and-choose only the spatial querying functionality they needed.
Conveniently, it also supports policies like disposing indexes which haven't been used in some time, or
creating indexes that aggregate multiple interval collections.

### Supporting segoff-based queries

A few spatially accelerated queries (e.g. `findOverlappingIntervals`, `findIntervalsWithStartInRange`) use the implementation strategy of creating a transient interval and comparing it to intervals in a tree using the sequence interval comparator.

From a performance standpoint, it would actually be preferable for these queries to be given the segment+offset for each endpoint rather than the character position,
but `IntervalCollection`'s generic interval parameter prevents this (a segment+offset API doesn't make sense for number-based intervals).

To remedy this, we could expose extensions of the above indexes specifically for SequenceInterval e.g.

```typescript
export interface IOverlappingSequenceIntervalsIndex
	extends IOverlappingIntervalsIndex<SequenceInterval> {
	findOverlappingIntervalsBySegoff(
		startSegment: ISegment,
		startOffset: number,
		endSegment: ISegment,
		endOffset: number,
	): Iterable<SequenceInterval>;
}
```

The implementation could also easily share code with the generic overlapping intervals index.

## Implementing `findIntervalsWithStartInRange`

This API can be implemented using a red-black tree whose comparator first compares the interval's start points as reference positions, then as IDs.
`RedBlackTree` then provides a `mapRange` implementation which only walks the necessary subtrees.

`findIntervalsWithEndInRange` can be implemented similarly using a different red-black tree which compares the intervals by their endpoints.

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	validateIndex,
	validateIndexRange,
	validatePositiveIndex,
	validateSafeInteger,
} from "./arrayUtilities.js";
export {
	type Brand,
	BrandedType,
	type NameFromBranded,
	type ValueFromBranded,
	type Values,
	brand,
	brandConst,
	strictEnum,
	unbrand,
} from "./brand.js";
export {
	type BrandedKey,
	type BrandedKeyContent,
	type BrandedMapSubset,
	brandedSlot,
	getOrCreateSlotContent,
} from "./brandedMap.js";
export {
	Breakable,
	type WithBreakable,
	breakingClass,
	breakingMethod,
	throwIfBroken,
} from "./breakable.js";
export {
	type TupleBTree,
	createTupleComparator,
	mergeTupleBTrees,
	newTupleBTree,
} from "./bTreeUtils.js";
export { cloneWithReplacements } from "./cloneWithReplacements.js";
export {
	type IdAllocationState,
	type IdAllocator,
	fakeIdAllocator,
	idAllocatorFromMaxId,
	idAllocatorFromState,
} from "./idAllocator.js";
export {
	type NestedMap,
	type ReadonlyNestedMap,
	SizedNestedMap,
	deleteFromNestedMap,
	forEachInNestedMap,
	getOrAddInNestedMap,
	getOrCreateInNestedMap,
	getOrDefaultInNestedMap,
	mapNestedMap,
	nestedMapFromFlatList,
	nestedMapToFlatList,
	populateNestedMap,
	setInNestedMap,
	tryAddToNestedMap,
	tryGetFromNestedMap,
} from "./nestedMap.js";
export { type NestedSet, addToNestedSet, nestedSetContains } from "./nestedSet.js";
export { type OffsetList, OffsetListFactory } from "./offsetList.js";
export {
	type ExtractFromOpaque,
	type Opaque,
	brandOpaque,
	extractFromOpaque,
} from "./opaque.js";
export {
	RangeMap,
	type RangeQueryResult,
	newIntegerRangeMap,
} from "./rangeMap.js";
export { readAndParseSnapshotBlob } from "./readSnapshotBlob.js";
export { type ReferenceCounted, ReferenceCountedBase } from "./referenceCounting.js";
export { StackyIterator } from "./stackyIterator.js";
export { brandedNumberType, brandedStringType } from "./typeboxBrand.js";
export type {
	Contravariant,
	Covariant,
	EnforceTypeCheckTests,
	Invariant,
	MakeNominal,
	areOnlyKeys,
	areSafelyAssignable,
	eitherIsAny,
	isAny,
	isAssignableTo,
	isStrictSubset,
	requireAssignableTo,
	requireFalse,
	requireTrue,
} from "./typeCheck.js";
export type {
	FlattenKeys,
	IsUnion,
	PopUnion,
	RestrictiveReadonlyRecord,
	RestrictiveStringRecord,
	UnionToIntersection,
	UnionToTuple,
	_InlineTrick,
	_RecursiveTrick,
} from "./typeUtils.js";
export { unsafeArrayToTuple } from "./typeUtils.js";
export {
	type IDisposable,
	type JsonCompatible,
	type JsonCompatibleObject,
	type JsonCompatibleReadOnly,
	type JsonCompatibleReadOnlyObject,
	JsonCompatibleReadOnlySchema,
	type Mutable,
	type Populated,
	type RecursiveReadonly,
	asMutable,
	assertNonNegativeSafeInteger,
	assertValidIndex,
	assertValidRange,
	assertValidRangeIndices,
	balancedReduce,
	capitalize,
	clone,
	compareNumbers,
	comparePartialNumbers,
	comparePartialStrings,
	compareSets,
	compareStrings,
	copyPropertyIfDefined as copyProperty,
	count,
	defineLazyCachedProperty,
	disposeSymbol,
	filterIterable,
	find,
	getLast,
	getOrAddEmptyToMap,
	getOrAddInMap,
	getOrCreate,
	hasSingle,
	hasSome,
	invertMap,
	isJsonObject,
	isReadonlyArray,
	iterableHasSome,
	makeArray,
	mapIterable,
	objectToMap,
	oneFromIterable,
	transformObjectMap,
} from "./utils.js";

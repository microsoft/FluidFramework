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
	brand,
	brandConst,
	type NameFromBranded,
	strictEnum,
	unbrand,
	type ValueFromBranded,
	type Values,
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
	breakingClass,
	breakingMethod,
	throwIfBroken,
	type WithBreakable,
} from "./breakable.js";
export {
	createTupleComparator,
	mergeTupleBTrees,
	newTupleBTree,
	type TupleBTree,
} from "./bTreeUtils.js";
export { cloneWithReplacements } from "./cloneWithReplacements.js";
export {
	fakeIdAllocator,
	type IdAllocationState,
	type IdAllocator,
	idAllocatorFromMaxId,
	idAllocatorFromState,
} from "./idAllocator.js";
export {
	deleteFromNestedMap,
	forEachInNestedMap,
	getOrAddInNestedMap,
	getOrCreateInNestedMap,
	getOrDefaultInNestedMap,
	mapNestedMap,
	type NestedMap,
	nestedMapFromFlatList,
	nestedMapToFlatList,
	populateNestedMap,
	type ReadonlyNestedMap,
	SizedNestedMap,
	setInNestedMap,
	tryAddToNestedMap,
	tryGetFromNestedMap,
} from "./nestedMap.js";
export { addToNestedSet, type NestedSet, nestedSetContains } from "./nestedSet.js";
export { type OffsetList, OffsetListFactory } from "./offsetList.js";
export {
	brandOpaque,
	type ExtractFromOpaque,
	extractFromOpaque,
	type Opaque,
} from "./opaque.js";
export {
	newIntegerRangeMap,
	RangeMap,
	type RangeQueryResult,
} from "./rangeMap.js";
export { readAndParseSnapshotBlob } from "./readSnapshotBlob.js";
export { type ReferenceCounted, ReferenceCountedBase } from "./referenceCounting.js";
export { StackyIterator } from "./stackyIterator.js";
export { brandedNumberType, brandedStringType } from "./typeboxBrand.js";
export type {
	areOnlyKeys,
	areSafelyAssignable,
	Contravariant,
	Covariant,
	EnforceTypeCheckTests,
	eitherIsAny,
	Invariant,
	isAny,
	isAssignableTo,
	isStrictSubset,
	MakeNominal,
	requireAssignableTo,
	requireFalse,
	requireTrue,
} from "./typeCheck.js";
export type {
	_InlineTrick,
	_RecursiveTrick,
	FlattenKeys,
	IsUnion,
	PopUnion,
	RestrictiveReadonlyRecord,
	RestrictiveStringRecord,
	UnionToIntersection,
	UnionToTuple,
} from "./typeUtils.js";
export { unsafeArrayToTuple } from "./typeUtils.js";
export {
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
	type IDisposable,
	invertMap,
	isJsonObject,
	isReadonlyArray,
	iterableHasSome,
	type JsonCompatible,
	type JsonCompatibleObject,
	type JsonCompatibleReadOnly,
	type JsonCompatibleReadOnlyObject,
	JsonCompatibleReadOnlySchema,
	type Mutable,
	makeArray,
	mapIterable,
	objectToMap,
	oneFromIterable,
	type Populated,
	type RecursiveReadonly,
	transformObjectMap,
} from "./utils.js";

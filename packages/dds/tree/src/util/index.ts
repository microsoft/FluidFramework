/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	brand,
	Brand,
	BrandedType,
	fromErased,
	Erased,
	ErasedType,
	NameFromBranded,
	ValueFromBranded,
	brandErased,
} from "./brand.js";
export { brandedNumberType, brandedStringType } from "./typeboxBrand.js";
export { brandOpaque, extractFromOpaque, ExtractFromOpaque, Opaque } from "./opaque.js";
export {
	deleteFromNestedMap,
	getOrAddInMap,
	getOrAddInNestedMap,
	getOrDefaultInNestedMap,
	forEachInNestedMap,
	NestedMap,
	SizedNestedMap,
	populateNestedMap,
	setInNestedMap,
	tryAddToNestedMap,
	tryGetFromNestedMap,
	nestedMapToFlatList,
	nestedMapFromFlatList,
} from "./nestedMap.js";
export { addToNestedSet, NestedSet, nestedSetContains } from "./nestedSet.js";
export { OffsetList, OffsetListFactory } from "./offsetList.js";
export { TransactionResult } from "./transactionResult.js";
export {
	areSafelyAssignable,
	Contravariant,
	Covariant,
	eitherIsAny,
	EnforceTypeCheckTests,
	Invariant,
	isAny,
	isAssignableTo,
	isStrictSubset,
	MakeNominal,
	requireFalse,
	requireTrue,
	requireAssignableTo,
} from "./typeCheck.js";
export { StackyIterator } from "./stackyIterator.js";
export {
	asMutable,
	clone,
	compareSets,
	fail,
	getOrAddEmptyToMap,
	getOrCreate,
	isJsonObject,
	isReadonlyArray,
	JsonCompatible,
	JsonCompatibleObject,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnlySchema,
	makeArray,
	mapIterable,
	Mutable,
	Populated,
	RecursiveReadonly,
	zipIterables,
	assertValidIndex,
	assertValidRange,
	assertNonNegativeSafeInteger,
	objectToMap,
	invertMap,
	oneFromSet,
	Named,
	compareNamed,
	disposeSymbol,
	IDisposable,
	capitalize,
	assertValidRangeIndices,
	transformObjectMap,
	compareStrings,
} from "./utils.js";
export { ReferenceCountedBase, ReferenceCounted } from "./referenceCounting.js";

export {
	AllowOptional,
	RequiredFields,
	OptionalFields,
	_InlineTrick,
	_RecursiveTrick,
	FlattenKeys,
	AllowOptionalNotFlattened,
	RestrictiveReadonlyRecord,
	Assume,
} from "./typeUtils.js";

export {
	BrandedKey,
	BrandedKeyContent,
	BrandedMapSubset,
	getOrCreateSlotContent,
	brandedSlot,
} from "./brandedMap.js";

export {
	getFirstEntryFromRangeMap,
	getFromRangeMap,
	RangeEntry,
	RangeMap,
	RangeQueryResult,
	setInRangeMap,
	deleteFromRangeMap,
	rangeMapToFlatList,
	unflattenToRangeMap,
} from "./rangeMap.js";

export {
	IdAllocator,
	idAllocatorFromMaxId,
	idAllocatorFromState,
	IdAllocationState,
	fakeIdAllocator,
} from "./idAllocator.js";

export {
	IRange,
	NestedRangeMap,
	tryGetFromNestedRangeMap,
	setInNestedRangeMap,
	populateNestedRangeMap,
	deleteFromNestedRangeMap,
	rangeToList,
} from "./nestedRangeMap.js";

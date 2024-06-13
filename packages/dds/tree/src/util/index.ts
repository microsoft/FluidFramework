/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	brand,
	type Brand,
	BrandedType,
	type NameFromBranded,
	type ValueFromBranded,
} from "./brand.js";
export { brandedNumberType, brandedStringType } from "./typeboxBrand.js";
export { brandOpaque, extractFromOpaque, type ExtractFromOpaque, type Opaque } from "./opaque.js";
export {
	deleteFromNestedMap,
	getOrAddInMap,
	getOrAddInNestedMap,
	getOrDefaultInNestedMap,
	forEachInNestedMap,
	type NestedMap,
	SizedNestedMap,
	populateNestedMap,
	setInNestedMap,
	tryAddToNestedMap,
	tryGetFromNestedMap,
	nestedMapToFlatList,
	nestedMapFromFlatList,
} from "./nestedMap.js";
export { addToNestedSet, type NestedSet, nestedSetContains } from "./nestedSet.js";
export { type OffsetList, OffsetListFactory } from "./offsetList.js";
export { TransactionResult } from "./transactionResult.js";
export type {
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
	type JsonCompatible,
	type JsonCompatibleObject,
	type JsonCompatibleReadOnly,
	type JsonCompatibleReadOnlyObject,
	JsonCompatibleReadOnlySchema,
	makeArray,
	mapIterable,
	type Mutable,
	type Populated,
	type RecursiveReadonly,
	assertValidIndex,
	assertValidRange,
	assertNonNegativeSafeInteger,
	objectToMap,
	invertMap,
	oneFromSet,
	type Named,
	compareNamed,
	disposeSymbol,
	type IDisposable,
	capitalize,
	assertValidRangeIndices,
	transformObjectMap,
	compareStrings,
	find,
} from "./utils.js";
export { ReferenceCountedBase, type ReferenceCounted } from "./referenceCounting.js";

export type {
	AllowOptional,
	RequiredFields,
	OptionalFields,
	_RecursiveTrick,
	AllowOptionalNotFlattened,
	RestrictiveReadonlyRecord,
	Assume,
} from "./typeUtils.js";

export {
	type BrandedKey,
	type BrandedKeyContent,
	type BrandedMapSubset,
	getOrCreateSlotContent,
	brandedSlot,
} from "./brandedMap.js";

export {
	getFirstEntryFromRangeMap,
	getFromRangeMap,
	type RangeEntry,
	type RangeMap,
	type RangeQueryResult,
	setInRangeMap,
	deleteFromRangeMap,
} from "./rangeMap.js";

export {
	type IdAllocator,
	idAllocatorFromMaxId,
	idAllocatorFromState,
	type IdAllocationState,
	fakeIdAllocator,
} from "./idAllocator.js";

import * as InternalUtilTypes from "./internalTypes.js";
export {
	/**
	 * Contains types used by the API, but which serve mechanical purposes and do not represent semantic concepts.
	 * They are used internally to implement API aspects, but are not intended for use by external consumers.
	 */
	InternalUtilTypes,
};

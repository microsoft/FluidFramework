/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	brand,
	Brand,
	BrandedType,
	brandOpaque,
	brandedNumberType,
	brandedStringType,
	extractFromOpaque,
	ExtractFromOpaque,
	NameFromBranded,
	Opaque,
	ValueFromBranded,
} from "./brand";
export {
	deleteFromNestedMap,
	getOrAddInMap,
	getOrAddInNestedMap,
	getOrDefaultInNestedMap,
	NestedMap,
	SizedNestedMap,
	setInNestedMap,
	tryAddToNestedMap,
	tryGetFromNestedMap,
} from "./nestedMap";
export { addToNestedSet, NestedSet, nestedSetContains } from "./nestedSet";
export { OffsetList, OffsetListFactory } from "./offsetList";
export { TransactionResult } from "./transactionResult";
export {
	areSafelyAssignable,
	Bivariant,
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
} from "./typeCheck";
export { StackyIterator } from "./stackyIterator";
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
	RecursiveReadonly,
	zipIterables,
	Assume,
	assertValidIndex,
	assertNonNegativeSafeInteger,
	generateStableId,
	useDeterministicStableId,
	objectToMap,
	oneFromSet,
	Named,
	disposeSymbol,
	IDisposable,
	capitalize,
} from "./utils";
export { ReferenceCountedBase, ReferenceCounted } from "./referenceCounting";

export {
	AllowOptional,
	RequiredFields,
	OptionalFields,
	_InlineTrick,
	_RecursiveTrick,
	FlattenKeys,
	AllowOptionalNotFlattened,
	RestrictiveReadonlyRecord,
} from "./typeUtils";

export {
	BrandedKey,
	BrandedKeyContent,
	BrandedMapSubset,
	getOrCreateSlotContent,
	brandedSlot,
} from "./brandedMap";

export { getFirstFromRangeMap, RangeEntry, RangeMap, setInRangeMap } from "./rangeMap";

export {
	IdAllocator,
	idAllocatorFromMaxId,
	idAllocatorFromState,
	IdAllocationState,
} from "./idAllocator";

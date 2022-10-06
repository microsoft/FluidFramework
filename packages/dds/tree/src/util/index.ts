/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	clone,
	fail,
	unreachableCase,
	makeArray,
	compareSets,
	getOrAddEmptyToMap,
	isJsonObject,
	RecursiveReadonly,
	JsonCompatible,
	JsonCompatibleObject,
	JsonCompatibleReadOnly,
} from "./utils";
export {
	EnforceTypeCheckTests,
	MakeNominal,
	Contravariant,
	Covariant,
	Bivariant,
	Invariant,
	requireTrue,
	requireFalse,
	isAssignableTo,
	isStrictSubset,
	areSafelyAssignable,
	eitherIsAny,
	isAny,
} from "./typeCheck";
export {
	extractFromOpaque,
	brand,
	brandOpaque,
	Brand,
	BrandedType,
	Opaque,
	ExtractFromOpaque,
	ValueFromBranded,
	NameFromBranded,
} from "./brand";
export { OffsetList, OffsetListFactory } from "./offsetList";
export { StackyIterator } from "./stackyIterator";

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
    brand,
    Brand,
    BrandedType,
    brandOpaque,
    extractFromOpaque,
    ExtractFromOpaque,
    NameFromBranded,
    Opaque,
    ValueFromBranded,
} from "./brand";
export { OffsetList, OffsetListFactory } from "./offsetList";
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
} from "./typeCheck";
export { StackyIterator } from "./stackyIterator";
export {
    clone,
    compareSets,
    fail,
    getOrAddEmptyToMap,
    isJsonObject,
    JsonCompatible,
    JsonCompatibleObject,
    JsonCompatibleReadOnly,
    makeArray,
    RecursiveReadonly,
    unreachableCase,
} from "./utils";

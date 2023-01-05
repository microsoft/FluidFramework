/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
export {
    ApiFunctionLike,
    ApiMemberKind,
    ApiModifier,
    ApiModuleLike,
    ApiSignatureLike,
    doesItemGenerateHierarchy,
    doesItemKindGenerateHierarchy,
    doesItemKindRequireOwnDocument,
    doesItemRequireOwnDocument,
    filterByKind,
    getAncestralHierarchy,
    getDefaultValueBlock,
    getDeprecatedBlock,
    getExampleBlocks,
    getFileNameForApiItem,
    getFilePathForApiItem,
    getFilteredParent,
    getFirstAncestorWithOwnDocument,
    getHeadingForApiItem,
    getHeadingIdForApiItem,
    getLinkForApiItem,
    getLinkUrlForApiItem,
    getModifiers,
    getQualifiedApiItemName,
    getReturnsBlock,
    getSeeBlocks,
    getThrowsBlocks,
    getUnscopedPackageName,
    isDeprecated,
    isOptional,
    isReadonly,
    isStatic,
} from "./ApiItemUtilities";
export { mergeSections } from "./DocNodeUtilities";

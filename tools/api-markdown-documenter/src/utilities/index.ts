/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
export {
    getQualifiedApiItemName,
    getFirstAncestorWithOwnDocument,
    getLinkForApiItem,
    getLinkUrlForApiItem,
    getUnscopedPackageName,
    getFilePathForApiItem,
    getFileNameForApiItem,
    getHeadingForApiItem,
    getHeadingIdForApiItem,
    getFilteredParent,
    getAncestralHierarchy,
    doesItemKindRequireOwnDocument,
    doesItemRequireOwnDocument,
    doesItemKindGenerateHierarchy,
    doesItemGenerateHierarchy,
    filterByKind,
    getExampleBlocks,
    getThrowsBlocks,
    getSeeBlocks,
    getDefaultValueBlock,
    getReturnsBlock,
    getDeprecatedBlock,
    isDeprecated,
    isOptional,
    isReadonly,
    isStatic,
    getModifiers,
    ApiMemberKind,
    ApiFunctionLike,
    ApiSignatureLike,
    ApiModuleLike,
    ApiModifier,
} from "./ApiItemUtilities";
export { mergeSections } from "./DocNodeUtilities";

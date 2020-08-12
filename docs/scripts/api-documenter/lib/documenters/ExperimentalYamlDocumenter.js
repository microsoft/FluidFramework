"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const tsdoc_1 = require("@microsoft/tsdoc");
const api_extractor_model_1 = require("@microsoft/api-extractor-model");
const YamlDocumenter_1 = require("./YamlDocumenter");
/**
 * EXPERIMENTAL - This documenter is a prototype of a new config file driven mode of operation for
 * API Documenter.  It is not ready for general usage yet.  Its design may change in the future.
 */
class ExperimentalYamlDocumenter extends YamlDocumenter_1.YamlDocumenter {
    constructor(apiModel, documenterConfig) {
        super(apiModel, documenterConfig.configFile.newDocfxNamespaces);
        this._config = documenterConfig.configFile.tableOfContents;
        this._tocPointerMap = {};
        this._generateTocPointersMap(this._config.tocConfig);
    }
    /** @override */
    buildYamlTocFile(apiItems) {
        this._buildTocItems2(apiItems);
        return this._config.tocConfig;
    }
    _buildTocItems2(apiItems) {
        const tocItems = [];
        for (const apiItem of apiItems) {
            let tocItem;
            if (apiItem.kind === "Namespace" /* Namespace */ && !this.newDocfxNamespaces) {
                tocItem = {
                    name: this._getTocItemName(apiItem)
                };
            }
            else {
                if (this._shouldEmbed(apiItem.kind)) {
                    // Don't generate table of contents items for embedded definitions
                    continue;
                }
                tocItem = {
                    name: this._getTocItemName(apiItem),
                    uid: this._getUid(apiItem)
                };
                if (apiItem.kind !== "Package" /* Package */) {
                    this._filterItem(apiItem, tocItem);
                }
            }
            tocItems.push(tocItem);
            const children = this._getLogicalChildren(apiItem);
            const childItems = this._buildTocItems2(children);
            if (childItems.length > 0) {
                tocItem.items = childItems;
            }
        }
        return tocItems;
    }
    // Parses the tocConfig object to build a pointers map of nodes where we want to sort out the API items
    _generateTocPointersMap(tocConfig) {
        const { catchAllCategory } = this._config;
        if (tocConfig.items) {
            for (const tocItem of tocConfig.items) {
                if (tocItem.items && tocItem.items.length > 0 && this._shouldNotIncludeInPointersMap(tocItem)) {
                    this._generateTocPointersMap(tocItem);
                }
                else {
                    // check for presence of the `catchAllCategory` config option
                    if (catchAllCategory && tocItem.name === catchAllCategory) {
                        this._catchAllPointer = tocItem;
                    }
                    else {
                        this._tocPointerMap[tocItem.name] = tocItem;
                    }
                }
            }
        }
    }
    /**
     * Filtering out the api-item by inlineTags or category name presence in the item name.
     */
    _filterItem(apiItem, tocItem) {
        const { categoryInlineTag, categorizeByName } = this._config;
        const { name: itemName } = tocItem;
        let filtered = false;
        // First we attempt to filter by inline tag if provided.
        if (apiItem instanceof api_extractor_model_1.ApiDocumentedItem) {
            const docInlineTag = categoryInlineTag
                ? this._findInlineTagByName(categoryInlineTag, apiItem.tsdocComment)
                : undefined;
            const tagContent = docInlineTag && docInlineTag.tagContent && docInlineTag.tagContent.trim();
            if (tagContent && this._tocPointerMap[tagContent]) {
                // null assertion used because when pointer map was created we checked for presence of empty `items` array
                this._tocPointerMap[tagContent].items.push(tocItem);
                filtered = true;
            }
        }
        // If not filtered by inline tag and `categorizeByName` config is enabled attempt to filter it by category name.
        if (!filtered && categorizeByName) {
            const pointers = Object.keys(this._tocPointerMap);
            for (let i = 0, length = pointers.length; i < length; i++) {
                if (itemName.indexOf(pointers[i]) !== -1) {
                    // null assertion used because when pointer map was created we checked for presence of empty `items` array
                    this._tocPointerMap[pointers[i]].items.push(tocItem);
                    filtered = true;
                    break;
                }
            }
        }
        // If item still not filtered and a `catchAllCategory` config provided push it to it.
        if (!filtered && this._catchAllPointer && this._catchAllPointer.items) {
            this._catchAllPointer.items.push(tocItem);
        }
    }
    // This is a direct copy of a @docCategory inline tag finder in office-ui-fabric-react,
    // but is generic enough to be used for any inline tag
    _findInlineTagByName(tagName, docComment) {
        const tagNameToCheck = `@${tagName}`;
        if (docComment instanceof tsdoc_1.DocInlineTag) {
            if (docComment.tagName === tagNameToCheck) {
                return docComment;
            }
        }
        if (docComment) {
            for (const childNode of docComment.getChildNodes()) {
                const result = this._findInlineTagByName(tagName, childNode);
                if (result !== undefined) {
                    return result;
                }
            }
        }
        return undefined;
    }
    _shouldNotIncludeInPointersMap(item) {
        const { nonEmptyCategoryNodeNames } = this._config;
        if (nonEmptyCategoryNodeNames && nonEmptyCategoryNodeNames.length) {
            return nonEmptyCategoryNodeNames.indexOf(item.name) === -1;
        }
        return true;
    }
}
exports.ExperimentalYamlDocumenter = ExperimentalYamlDocumenter;
//# sourceMappingURL=ExperimentalYamlDocumenter.js.map
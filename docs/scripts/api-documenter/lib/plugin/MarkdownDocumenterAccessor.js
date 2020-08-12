"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Provides access to the documenter that is generating the output.
 *
 * @privateRemarks
 * This class is wrapper that provides access to the underlying MarkdownDocumenter, while hiding the implementation
 * details to ensure that the plugin API contract is stable.
 *
 * @public
 */
class MarkdownDocumenterAccessor {
    /** @internal */
    constructor(implementation) {
        this._implementation = implementation;
    }
    /**
     * For a given `ApiItem`, return its markdown hyperlink.
     *
     * @returns The hyperlink, or `undefined` if the `ApiItem` object does not have a hyperlink.
     */
    getLinkForApiItem(apiItem) {
        return this._implementation.getLinkForApiItem(apiItem);
    }
}
exports.MarkdownDocumenterAccessor = MarkdownDocumenterAccessor;
//# sourceMappingURL=MarkdownDocumenterAccessor.js.map
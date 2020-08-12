"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const api_extractor_model_1 = require("@microsoft/api-extractor-model");
class Utilities {
    /**
     * Generates a concise signature for a function.  Example: "getArea(width, height)"
     */
    static getConciseSignature(apiItem) {
        if (api_extractor_model_1.ApiParameterListMixin.isBaseClassOf(apiItem)) {
            return apiItem.displayName + '(' + apiItem.parameters.map((x) => x.name).join(', ') + ')';
        }
        return apiItem.displayName;
    }
    /**
     * Converts bad filename characters to underscores.
     */
    static getSafeFilenameForName(name) {
        // TODO: This can introduce naming collisions.
        // We will fix that as part of https://github.com/microsoft/rushstack/issues/1308
        return name.replace(Utilities._badFilenameCharsRegExp, '_').toLowerCase();
    }
}
Utilities._badFilenameCharsRegExp = /[^a-z0-9_\-\.]/gi;
exports.Utilities = Utilities;
//# sourceMappingURL=Utilities.js.map
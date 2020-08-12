"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const tsdoc_1 = require("@microsoft/tsdoc");
/**
 * Represents a span of text that is styled with CommonMark emphasis (italics), strong emphasis (boldface),
 * or both.
 */
class DocEmphasisSpan extends tsdoc_1.DocNodeContainer {
    constructor(parameters, children) {
        super(parameters, children);
        this.bold = !!parameters.bold;
        this.italic = !!parameters.italic;
    }
    /** @override */
    get kind() {
        return "EmphasisSpan" /* EmphasisSpan */;
    }
}
exports.DocEmphasisSpan = DocEmphasisSpan;
//# sourceMappingURL=DocEmphasisSpan.js.map
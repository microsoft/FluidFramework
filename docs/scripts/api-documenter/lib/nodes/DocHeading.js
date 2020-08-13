"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const tsdoc_1 = require("@microsoft/tsdoc");
/**
 * Represents a section header similar to an HTML `<h1>` or `<h2>` element.
 */
class DocHeading extends tsdoc_1.DocNode {
    /**
     * Don't call this directly.  Instead use {@link TSDocParser}
     * @internal
     */
    constructor(parameters) {
        super(parameters);
        this.title = parameters.title;
        this.level = parameters.level !== undefined ? parameters.level : 1;
        this.id = parameters.id !== undefined ? parameters.id : '';
        if (this.level < 1 || this.level > 5) {
            throw new Error('IDocHeadingParameters.level must be a number between 1 and 5');
        }
    }
    /** @override */
    get kind() {
        return "Heading" /* Heading */;
    }
}
exports.DocHeading = DocHeading;
//# sourceMappingURL=DocHeading.js.map
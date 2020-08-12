"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const tsdoc_1 = require("@microsoft/tsdoc");
/**
 * Represents table cell, similar to an HTML `<td>` element.
 */
class DocTableCell extends tsdoc_1.DocNode {
    constructor(parameters, sectionChildNodes) {
        super(parameters);
        this.content = new tsdoc_1.DocSection({ configuration: this.configuration }, sectionChildNodes);
    }
    /** @override */
    get kind() {
        return "TableCell" /* TableCell */;
    }
}
exports.DocTableCell = DocTableCell;
//# sourceMappingURL=DocTableCell.js.map
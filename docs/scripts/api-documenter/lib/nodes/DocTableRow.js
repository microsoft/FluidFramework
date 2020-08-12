"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const tsdoc_1 = require("@microsoft/tsdoc");
const DocTableCell_1 = require("./DocTableCell");
/**
 * Represents table row, similar to an HTML `<tr>` element.
 */
class DocTableRow extends tsdoc_1.DocNode {
    constructor(parameters, cells) {
        super(parameters);
        this._cells = [];
        if (cells) {
            for (const cell of cells) {
                this.addCell(cell);
            }
        }
    }
    /** @override */
    get kind() {
        return "TableRow" /* TableRow */;
    }
    get cells() {
        return this._cells;
    }
    addCell(cell) {
        this._cells.push(cell);
    }
    createAndAddCell() {
        const newCell = new DocTableCell_1.DocTableCell({ configuration: this.configuration });
        this.addCell(newCell);
        return newCell;
    }
    addPlainTextCell(cellContent) {
        const cell = this.createAndAddCell();
        cell.content.appendNodeInParagraph(new tsdoc_1.DocPlainText({
            configuration: this.configuration,
            text: cellContent
        }));
        return cell;
    }
    /** @override */
    onGetChildNodes() {
        return this._cells;
    }
}
exports.DocTableRow = DocTableRow;
//# sourceMappingURL=DocTableRow.js.map
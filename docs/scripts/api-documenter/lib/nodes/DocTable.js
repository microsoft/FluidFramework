"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const tsdoc_1 = require("@microsoft/tsdoc");
const DocTableRow_1 = require("./DocTableRow");
/**
 * Represents table, similar to an HTML `<table>` element.
 */
class DocTable extends tsdoc_1.DocNode {
    constructor(parameters, rows) {
        super(parameters);
        this.header = new DocTableRow_1.DocTableRow({ configuration: this.configuration });
        this._rows = [];
        if (parameters) {
            this.cssClass = parameters.cssClass;
            if (parameters.headerTitles) {
                if (parameters.headerCells) {
                    throw new Error('IDocTableParameters.headerCells and IDocTableParameters.headerTitles' +
                        ' cannot both be specified');
                }
                for (const cellText of parameters.headerTitles) {
                    this.header.addPlainTextCell(cellText);
                }
            }
            else if (parameters.headerCells) {
                for (const cell of parameters.headerCells) {
                    this.header.addCell(cell);
                }
            }
        }
        if (rows) {
            for (const row of rows) {
                this.addRow(row);
            }
        }
    }
    /** @override */
    get kind() {
        return "Table" /* Table */;
    }
    get rows() {
        return this._rows;
    }
    addRow(row) {
        this._rows.push(row);
    }
    createAndAddRow() {
        const row = new DocTableRow_1.DocTableRow({ configuration: this.configuration });
        this.addRow(row);
        return row;
    }
    /** @override */
    onGetChildNodes() {
        return [this.header, ...this._rows];
    }
}
exports.DocTable = DocTable;
//# sourceMappingURL=DocTable.js.map
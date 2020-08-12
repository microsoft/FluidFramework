"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const tsdoc_1 = require("@microsoft/tsdoc");
/**
 * Represents a note box, which is typically displayed as a bordered box containing informational text.
 */
class DocNoteBox extends tsdoc_1.DocNode {
    constructor(parameters, sectionChildNodes) {
        super(parameters);
        this.content = new tsdoc_1.DocSection({ configuration: this.configuration }, sectionChildNodes);
    }
    /** @override */
    get kind() {
        return "NoteBox" /* NoteBox */;
    }
    /** @override */
    onGetChildNodes() {
        return [this.content];
    }
}
exports.DocNoteBox = DocNoteBox;
//# sourceMappingURL=DocNoteBox.js.map
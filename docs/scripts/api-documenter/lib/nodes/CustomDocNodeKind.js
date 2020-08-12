"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tsdoc_1 = require("@microsoft/tsdoc");
const DocEmphasisSpan_1 = require("./DocEmphasisSpan");
const DocHeading_1 = require("./DocHeading");
const DocNoteBox_1 = require("./DocNoteBox");
const DocTable_1 = require("./DocTable");
const DocTableCell_1 = require("./DocTableCell");
const DocTableRow_1 = require("./DocTableRow");
class CustomDocNodes {
    static get configuration() {
        if (CustomDocNodes._configuration === undefined) {
            const configuration = new tsdoc_1.TSDocConfiguration();
            configuration.docNodeManager.registerDocNodes('@micrososft/api-documenter', [
                { docNodeKind: "EmphasisSpan" /* EmphasisSpan */, constructor: DocEmphasisSpan_1.DocEmphasisSpan },
                { docNodeKind: "Heading" /* Heading */, constructor: DocHeading_1.DocHeading },
                { docNodeKind: "NoteBox" /* NoteBox */, constructor: DocNoteBox_1.DocNoteBox },
                { docNodeKind: "Table" /* Table */, constructor: DocTable_1.DocTable },
                { docNodeKind: "TableCell" /* TableCell */, constructor: DocTableCell_1.DocTableCell },
                { docNodeKind: "TableRow" /* TableRow */, constructor: DocTableRow_1.DocTableRow }
            ]);
            configuration.docNodeManager.registerAllowableChildren("EmphasisSpan" /* EmphasisSpan */, [
                "PlainText" /* PlainText */,
                "SoftBreak" /* SoftBreak */
            ]);
            configuration.docNodeManager.registerAllowableChildren("Section" /* Section */, [
                "Heading" /* Heading */,
                "NoteBox" /* NoteBox */,
                "Table" /* Table */
            ]);
            configuration.docNodeManager.registerAllowableChildren("Paragraph" /* Paragraph */, [
                "EmphasisSpan" /* EmphasisSpan */
            ]);
            CustomDocNodes._configuration = configuration;
        }
        return CustomDocNodes._configuration;
    }
}
exports.CustomDocNodes = CustomDocNodes;
//# sourceMappingURL=CustomDocNodeKind.js.map
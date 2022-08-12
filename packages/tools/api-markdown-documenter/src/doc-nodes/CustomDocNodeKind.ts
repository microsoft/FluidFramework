import { DocEmphasisSpan } from "@microsoft/api-documenter/lib/nodes/DocEmphasisSpan";
import { DocNoteBox } from "@microsoft/api-documenter/lib/nodes/DocNoteBox";
import { DocTable } from "@microsoft/api-documenter/lib/nodes/DocTable";
import { DocTableCell } from "@microsoft/api-documenter/lib/nodes/DocTableCell";
import { DocTableRow } from "@microsoft/api-documenter/lib/nodes/DocTableRow";
import { DocNodeKind, TSDocConfiguration } from "@microsoft/tsdoc";

import { DocHeading } from "./DocHeading";

/**
 * Identifies custom subclasses of `DocNode`.
 */
export const enum CustomDocNodeKind {
    EmphasisSpan = "EmphasisSpan",
    Heading = "Heading",
    NoteBox = "NoteBox",
    Table = "Table",
    TableCell = "TableCell",
    TableRow = "TableRow",
    HtmlLink = "HtmlLink",
}

export class CustomDocNodes {
    private static _configuration: TSDocConfiguration | undefined;

    public static get configuration(): TSDocConfiguration {
        if (CustomDocNodes._configuration === undefined) {
            const configuration: TSDocConfiguration = new TSDocConfiguration();

            configuration.docNodeManager.registerDocNodes("@fluid-tools/api-markdown-documenter", [
                { docNodeKind: CustomDocNodeKind.EmphasisSpan, constructor: DocEmphasisSpan },
                { docNodeKind: CustomDocNodeKind.Heading, constructor: DocHeading },
                { docNodeKind: CustomDocNodeKind.NoteBox, constructor: DocNoteBox },
                { docNodeKind: CustomDocNodeKind.Table, constructor: DocTable },
                { docNodeKind: CustomDocNodeKind.TableCell, constructor: DocTableCell },
                { docNodeKind: CustomDocNodeKind.TableRow, constructor: DocTableRow },
            ]);

            configuration.docNodeManager.registerAllowableChildren(CustomDocNodeKind.EmphasisSpan, [
                DocNodeKind.PlainText,
                DocNodeKind.SoftBreak,
            ]);

            configuration.docNodeManager.registerAllowableChildren(DocNodeKind.Section, [
                CustomDocNodeKind.Heading,
                CustomDocNodeKind.NoteBox,
                CustomDocNodeKind.Table,
                DocNodeKind.Section,
            ]);

            configuration.docNodeManager.registerAllowableChildren(DocNodeKind.Paragraph, [
                CustomDocNodeKind.EmphasisSpan,
                CustomDocNodeKind.Heading,
                DocNodeKind.Paragraph,
                CustomDocNodeKind.NoteBox,
                CustomDocNodeKind.Table,
                CustomDocNodeKind.Table,
                DocNodeKind.FencedCode,
            ]);

            CustomDocNodes._configuration = configuration;
        }
        return CustomDocNodes._configuration;
    }
}

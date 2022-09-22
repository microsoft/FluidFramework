/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocEmphasisSpan } from "@microsoft/api-documenter/lib/nodes/DocEmphasisSpan";
import { DocNoteBox } from "@microsoft/api-documenter/lib/nodes/DocNoteBox";
import { DocTable } from "@microsoft/api-documenter/lib/nodes/DocTable";
import { DocTableCell } from "@microsoft/api-documenter/lib/nodes/DocTableCell";
import { DocTableRow } from "@microsoft/api-documenter/lib/nodes/DocTableRow";
import { DocNodeKind, TSDocConfiguration } from "@microsoft/tsdoc";

import { DocAlert } from "./DocAlert";
import { DocHeading } from "./DocHeading";
import { DocList } from "./DocList";

/**
 * Identifies custom subclasses of `DocNode`.
 *
 * @internal
 */
export const enum CustomDocNodeKind {
    Alert = "Alert",
    EmphasisSpan = "EmphasisSpan",
    Heading = "Heading",
    List = "List",
    NoteBox = "NoteBox",
    Table = "Table",
    TableCell = "TableCell",
    TableRow = "TableRow",
    HtmlLink = "HtmlLink",
}

/**
 * Defines the allowed configurations of `DocNode` contents.
 *
 * @remarks These rules are evaluated at runtime by the {@link MarkdownEmitter}.
 *
 * @internal
 */
export class CustomDocNodes {
    private static _configuration: TSDocConfiguration | undefined;

    public static get configuration(): TSDocConfiguration {
        if (CustomDocNodes._configuration === undefined) {
            const configuration: TSDocConfiguration = new TSDocConfiguration();

            configuration.docNodeManager.registerDocNodes("@fluid-tools/api-markdown-documenter", [
                {
                    docNodeKind: CustomDocNodeKind.Alert,
                    constructor: DocAlert,
                },
                {
                    docNodeKind: CustomDocNodeKind.EmphasisSpan,
                    constructor: DocEmphasisSpan,
                },
                {
                    docNodeKind: CustomDocNodeKind.Heading,
                    constructor: DocHeading,
                },
                {
                    docNodeKind: CustomDocNodeKind.List,
                    constructor: DocList,
                },
                {
                    docNodeKind: CustomDocNodeKind.NoteBox,
                    constructor: DocNoteBox,
                },
                {
                    docNodeKind: CustomDocNodeKind.Table,
                    constructor: DocTable,
                },
                {
                    docNodeKind: CustomDocNodeKind.TableCell,
                    constructor: DocTableCell,
                },
                {
                    docNodeKind: CustomDocNodeKind.TableRow,
                    constructor: DocTableRow,
                },
            ]);

            configuration.docNodeManager.registerAllowableChildren(CustomDocNodeKind.EmphasisSpan, [
                DocNodeKind.PlainText,
                DocNodeKind.SoftBreak,
            ]);

            configuration.docNodeManager.registerAllowableChildren(DocNodeKind.Section, [
                CustomDocNodeKind.Alert,
                CustomDocNodeKind.Heading,
                CustomDocNodeKind.List,
                CustomDocNodeKind.NoteBox,
                CustomDocNodeKind.Table,
                DocNodeKind.CodeSpan,
                DocNodeKind.Section,
            ]);

            configuration.docNodeManager.registerAllowableChildren(DocNodeKind.Paragraph, [
                CustomDocNodeKind.EmphasisSpan,
                CustomDocNodeKind.Heading,
                CustomDocNodeKind.List,
                DocNodeKind.Paragraph,
                CustomDocNodeKind.NoteBox,
                CustomDocNodeKind.Table,
                DocNodeKind.FencedCode,
            ]);

            configuration.docNodeManager.registerAllowableChildren(CustomDocNodeKind.List, [
                CustomDocNodeKind.EmphasisSpan,
                DocNodeKind.Paragraph,
                DocNodeKind.PlainText,
            ]);

            configuration.docNodeManager.registerAllowableChildren(CustomDocNodeKind.Alert, [
                DocNodeKind.Paragraph,
                DocNodeKind.Section,
            ]);

            CustomDocNodes._configuration = configuration;
        }
        return CustomDocNodes._configuration;
    }
}

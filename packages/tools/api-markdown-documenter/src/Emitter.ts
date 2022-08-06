// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import {
    IMarkdownEmitterContext,
    IMarkdownEmitterOptions,
    MarkdownEmitter,
} from "@microsoft/api-documenter/lib/markdown/MarkdownEmitter";
import { CustomDocNodeKind } from "@microsoft/api-documenter/lib/nodes/CustomDocNodeKind";
import { DocEmphasisSpan } from "@microsoft/api-documenter/lib/nodes/DocEmphasisSpan";
import { DocHeading } from "@microsoft/api-documenter/lib/nodes/DocHeading";
import { DocNoteBox } from "@microsoft/api-documenter/lib/nodes/DocNoteBox";
import { DocTable } from "@microsoft/api-documenter/lib/nodes/DocTable";
import { DocTableCell } from "@microsoft/api-documenter/lib/nodes/DocTableCell";
import { IndentedWriter } from "@microsoft/api-documenter/lib/utils/IndentedWriter";
import {
    ApiItem,
    ApiModel,
    IResolveDeclarationReferenceResult,
} from "@microsoft/api-extractor-model";
import { DocLinkTag, DocNode, StringBuilder } from "@microsoft/tsdoc";
import * as colors from "colors";

import { FileNamePolicy } from "./Policies";

export interface ICustomMarkdownEmitterOptions extends IMarkdownEmitterOptions {
    contextApiItem: ApiItem | undefined;
    fileNamePolicy: FileNamePolicy;
}

export class CustomMarkdownEmitter extends MarkdownEmitter {
    private _apiModel: ApiModel;

    public constructor(apiModel: ApiModel) {
        super();

        this._apiModel = apiModel;
    }

    public emit(
        stringBuilder: StringBuilder,
        docNode: DocNode,
        options: ICustomMarkdownEmitterOptions,
    ): string {
        return super.emit(stringBuilder, docNode, options);
    }

    /** @override */
    protected writeNode(
        docNode: DocNode,
        context: IMarkdownEmitterContext,
        docNodeSiblings: boolean,
    ): void {
        const writer: IndentedWriter = context.writer;

        switch (docNode.kind) {
            case CustomDocNodeKind.Heading: {
                const docHeading: DocHeading = docNode as DocHeading;
                writer.ensureSkippedLine();

                let prefix: string;
                switch (docHeading.level) {
                    case 1:
                        prefix = "##";
                        break;
                    case 2:
                        prefix = "###";
                        break;
                    case 3:
                        prefix = "###";
                        break;
                    default:
                        prefix = "####";
                }
                let suffix: string = "";
                if (docHeading.id !== "") {
                    suffix = ` {#${docHeading.id}}`;
                }

                writer.writeLine(prefix + " " + this.getEscapedText(docHeading.title) + suffix);
                writer.writeLine();
                break;
            }
            case CustomDocNodeKind.NoteBox: {
                const docNoteBox: DocNoteBox = docNode as DocNoteBox;
                writer.ensureNewLine();

                writer.writeLine(
                    `{{% callout ${docNoteBox.type} ${
                        docNoteBox.title ? docNoteBox.title : ""
                    } %}}`,
                );

                this.writeNode(docNoteBox.content, context, false);
                writer.ensureNewLine();

                writer.writeLine("{{% /callout %}}");
                writer.writeLine();
                break;
            }
            case CustomDocNodeKind.Table: {
                const docTable: DocTable = docNode as DocTable;
                // GitHub's markdown renderer chokes on tables that don't have a blank line above them,
                // whereas VS Code's renderer is totally fine with it.
                writer.ensureSkippedLine();

                context.insideTable = true;
                if (docTable.cssClass) {
                    this._writeHTMLTable(writer, context, docTable);
                } else {
                    this._writeMarkdownTable(writer, context, docTable);
                }
                break;
            }
            case CustomDocNodeKind.EmphasisSpan: {
                const docEmphasisSpan: DocEmphasisSpan = docNode as DocEmphasisSpan;
                const oldBold: boolean = context.boldRequested;
                const oldItalic: boolean = context.italicRequested;
                context.boldRequested = docEmphasisSpan.bold;
                context.italicRequested = docEmphasisSpan.italic;
                this.writeNodes(docEmphasisSpan.nodes, context);
                context.boldRequested = oldBold;
                context.italicRequested = oldItalic;
                break;
            }
            default:
                super.writeNode(docNode, context, false);
        }
    }

    /** @override */
    protected writeLinkTagWithCodeDestination(
        docLinkTag: DocLinkTag,
        context: IMarkdownEmitterContext<ICustomMarkdownEmitterOptions>,
    ): void {
        const options: ICustomMarkdownEmitterOptions = context.options;

        const result: IResolveDeclarationReferenceResult =
            this._apiModel.resolveDeclarationReference(
                docLinkTag.codeDestination!,
                options.contextApiItem,
            );

        if (result.resolvedApiItem) {
            const filename: string | undefined = options.fileNamePolicy(result.resolvedApiItem);

            if (filename) {
                let linkText: string = docLinkTag.linkText || "";
                if (linkText.length === 0) {
                    // Generate a name such as Namespace1.Namespace2.MyClass.myMethod()
                    linkText = result.resolvedApiItem.getScopedNameWithinPackage();
                }
                if (linkText.length > 0) {
                    if (context.insideHTML) {
                        context.writer.write(
                            `<a href='${filename!.replace(/\.md$/, "/")}'>${linkText.replace(
                                /\s+/g,
                                " ",
                            )}</a>`,
                        );
                    } else {
                        const encodedLinkText: string = this.getEscapedText(
                            linkText.replace(/\s+/g, " "),
                        );
                        context.writer.write("[");
                        context.writer.write(encodedLinkText);
                        context.writer.write(`](${filename!})`);
                    }
                } else {
                    console.log(colors.yellow("WARNING: Unable to determine link text"));
                }
            }
        } else if (result.errorMessage) {
            console.log(
                colors.yellow(
                    `WARNING: Unable to resolve reference "${docLinkTag.codeDestination!.emitAsTsdoc()}": ` +
                        result.errorMessage,
                ),
            );
        }
    }

    private _writeMarkdownTable(
        writer: IndentedWriter,
        context: IMarkdownEmitterContext,
        docTable: DocTable,
    ): void {
        // Markdown table rows can have inconsistent cell counts.  Size the table based on the longest row.
        let columnCount: number = 0;
        if (docTable.header) {
            columnCount = docTable.header.cells.length;
        }
        for (const row of docTable.rows) {
            if (row.cells.length > columnCount) {
                columnCount = row.cells.length;
            }
        }

        // write the table header (which is required by Markdown)
        writer.write("| ");
        for (let i: number = 0; i < columnCount; ++i) {
            writer.write(" ");
            if (docTable.header) {
                const cell: DocTableCell | undefined = docTable.header.cells[i];
                if (cell) {
                    this.writeNode(cell.content, context, false);
                }
            }
            writer.write(" |");
        }
        writer.writeLine();

        // write the divider
        writer.write("| ");
        for (let i: number = 0; i < columnCount; ++i) {
            writer.write(" --- |");
        }
        writer.writeLine();

        for (const row of docTable.rows) {
            writer.write("| ");
            for (const cell of row.cells) {
                writer.write(" ");
                this.writeNode(cell.content, context, false);
                writer.write(" |");
            }
            writer.writeLine();
        }
        writer.writeLine();

        context.insideTable = false;
    }

    private _writeHTMLTable(
        writer: IndentedWriter,
        context: IMarkdownEmitterContext,
        docTable: DocTable,
    ): void {
        context.insideHTML = true;
        let columnCount: number = 0;
        if (docTable.header) {
            columnCount = docTable.header.cells.length;
        }
        for (const row of docTable.rows) {
            if (row.cells.length > columnCount) {
                columnCount = row.cells.length;
            }
        }

        // write the table header
        writer.writeLine(`<table class="table table-striped table-hover ${docTable.cssClass}">`);
        if (docTable.caption) {
            writer.writeLine(`<caption>${docTable.caption}</caption>`);
        }
        writer.writeLine("  <thead>");
        writer.writeLine("    <tr>");
        writer.write("    ");
        for (let i: number = 0; i < columnCount; ++i) {
            writer.write(" ");
            if (docTable.header) {
                const cell: DocTableCell | undefined = docTable.header.cells[i];
                if (cell) {
                    writer.write('<th scope="col">');
                    this.writeNode(cell.content, context, false);
                    writer.write("</th>");
                    writer.writeLine();
                }
            }
        }
        writer.writeLine("    </tr>");
        writer.writeLine("  </thead>");

        writer.writeLine("  <tbody>");
        for (const row of docTable.rows) {
            writer.writeLine("    <tr>");
            for (const cell of row.cells) {
                writer.write("      ");
                writer.write("<td>");
                this.writeNode(cell.content, context, false);
                writer.writeLine("</td>");
            }
            writer.writeLine("    </tr>");
        }

        writer.writeLine("  </tbody>");
        writer.writeLine("</table>");
        writer.writeLine();

        context.insideTable = false;
        context.insideHTML = false;
    }
}

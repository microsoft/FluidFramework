// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';

import { DocNode, DocLinkTag, StringBuilder } from '@microsoft/tsdoc';
import { ApiModel, IResolveDeclarationReferenceResult, ApiItem } from '@microsoft/api-extractor-model';

import { CustomDocNodeKind } from '../nodes/CustomDocNodeKind';
import { DocHeading } from '../nodes/DocHeading';
import { DocNoteBox } from '../nodes/DocNoteBox';
import { DocTable } from '../nodes/DocTable';
import { DocTableCell } from '../nodes/DocTableCell';
import { DocEmphasisSpan } from '../nodes/DocEmphasisSpan';
import { MarkdownEmitter, IMarkdownEmitterContext, IMarkdownEmitterOptions } from './MarkdownEmitter';
import { IndentedWriter } from '../utils/IndentedWriter';

export interface ICustomMarkdownEmitterOptions extends IMarkdownEmitterOptions {
    contextApiItem: ApiItem | undefined;

    onGetFilenameForApiItem: (apiItem: ApiItem) => string | undefined;
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
        options: ICustomMarkdownEmitterOptions
    ): string {
        return super.emit(stringBuilder, docNode, options);
    }

    /** @override */
    protected writeNode(docNode: DocNode, context: IMarkdownEmitterContext, docNodeSiblings: boolean): void {
        const writer: IndentedWriter = context.writer;

        switch (docNode.kind) {
            case CustomDocNodeKind.Heading: {
                const docHeading: DocHeading = docNode as DocHeading;
                writer.ensureSkippedLine();

                let prefix: string;
                switch (docHeading.level) {
                    case 1:
                        prefix = '##';
                        break;
                    case 2:
                        prefix = '###';
                        break;
                    case 3:
                        prefix = '###';
                        break;
                    default:
                        prefix = '####';
                }
                let suffix: string = '';
                if (docHeading.id !== '') {
                    suffix = ` {#${docHeading.id}}`;
                }

                writer.writeLine(prefix + ' ' + this.getEscapedText(docHeading.title) + suffix);
                writer.writeLine();
                break;
            }
            case CustomDocNodeKind.NoteBox: {
                const docNoteBox: DocNoteBox = docNode as DocNoteBox;
                writer.ensureNewLine();

                writer.increaseIndent('> ');

                this.writeNode(docNoteBox.content, context, false);
                writer.ensureNewLine();

                writer.decreaseIndent();

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
        context: IMarkdownEmitterContext<ICustomMarkdownEmitterOptions>
    ): void {
        const options: ICustomMarkdownEmitterOptions = context.options;

        const result: IResolveDeclarationReferenceResult = this._apiModel.resolveDeclarationReference(
            docLinkTag.codeDestination!,
            options.contextApiItem
        );

        if (result.resolvedApiItem) {
            const filename: string | undefined = options.onGetFilenameForApiItem(result.resolvedApiItem);

            if (filename) {
                let linkText: string = docLinkTag.linkText || '';
                if (linkText.length === 0) {
                    // Generate a name such as Namespace1.Namespace2.MyClass.myMethod()
                    linkText = result.resolvedApiItem.getScopedNameWithinPackage();
                }
                if (linkText.length > 0) {
                    const encodedLinkText: string = this.getEscapedText(linkText.replace(/\s+/g, ' '));

                    if (context.insideHTML) {
                        context.writer.write(`<a href='${filename!.replace(/\.md$/, '/')}'>${encodedLinkText}</a>`);
                    } else {
                        context.writer.write('[');
                        context.writer.write(encodedLinkText);
                        context.writer.write(`](${filename!})`);
                    }
                } else {
                    console.log(colors.yellow('WARNING: Unable to determine link text'));
                }
            }
        } else if (result.errorMessage) {
            console.log(
                colors.yellow(
                    `WARNING: Unable to resolve reference "${docLinkTag.codeDestination!.emitAsTsdoc()}": ` +
                    result.errorMessage
                )
            );

        }
    }

    private _writeMarkdownTable(writer: IndentedWriter, context: IMarkdownEmitterContext, docTable: DocTable): void {
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
        writer.write('| ');
        for (let i: number = 0; i < columnCount; ++i) {
            writer.write(' ');
            if (docTable.header) {
                const cell: DocTableCell | undefined = docTable.header.cells[i];
                if (cell) {
                    this.writeNode(cell.content, context, false);
                }
            }
            writer.write(' |');
        }
        writer.writeLine();

        // write the divider
        writer.write('| ');
        for (let i: number = 0; i < columnCount; ++i) {
            writer.write(' --- |');
        }
        writer.writeLine();

        for (const row of docTable.rows) {
            writer.write('| ');
            for (const cell of row.cells) {
                writer.write(' ');
                this.writeNode(cell.content, context, false);
                writer.write(' |');
            }
            writer.writeLine();
        }
        writer.writeLine();

        context.insideTable = false;
    }

    private _writeHTMLTable(writer: IndentedWriter, context: IMarkdownEmitterContext, docTable: DocTable): void {
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
        writer.writeLine('  <thead>');
        writer.writeLine('    <tr>');
        writer.write('    ');
        for (let i: number = 0; i < columnCount; ++i) {
            writer.write(' ');
            if (docTable.header) {
                const cell: DocTableCell | undefined = docTable.header.cells[i];
                if (cell) {
                    writer.write('<th scope="col">');
                    this.writeNode(cell.content, context, false);
                    writer.write('</th>');
                    writer.writeLine();
                }
            }
        }
        writer.writeLine('    </tr>');
        writer.writeLine('  </thead>');

        writer.writeLine('  <tbody>');
        for (const row of docTable.rows) {
            writer.writeLine('    <tr>');
            for (const cell of row.cells) {
                writer.write('      ');
                writer.write('<td>');
                this.writeNode(cell.content, context, false);
                writer.write('</td>');
            }
            writer.writeLine('    </tr>');
        }

        writer.writeLine('  </tbody>');
        writer.writeLine('</table>')
        writer.writeLine();

        context.insideTable = false;
        context.insideHTML = false;
    }
}

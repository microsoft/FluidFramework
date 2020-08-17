"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const colors = require("colors");
const MarkdownEmitter_1 = require("./MarkdownEmitter");
class CustomMarkdownEmitter extends MarkdownEmitter_1.MarkdownEmitter {
    constructor(apiModel) {
        super();
        this._apiModel = apiModel;
    }
    emit(stringBuilder, docNode, options) {
        return super.emit(stringBuilder, docNode, options);
    }
    /** @override */
    writeNode(docNode, context, docNodeSiblings) {
        const writer = context.writer;
        switch (docNode.kind) {
            case "Heading" /* Heading */: {
                const docHeading = docNode;
                writer.ensureSkippedLine();
                let prefix;
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
                let suffix = '';
                if (docHeading.id !== '') {
                    suffix = ` {#${docHeading.id}}`;
                }
                writer.writeLine(prefix + ' ' + this.getEscapedText(docHeading.title) + suffix);
                writer.writeLine();
                break;
            }
            case "NoteBox" /* NoteBox */: {
                const docNoteBox = docNode;
                writer.ensureNewLine();
                writer.increaseIndent('> ');
                this.writeNode(docNoteBox.content, context, false);
                writer.ensureNewLine();
                writer.decreaseIndent();
                writer.writeLine();
                break;
            }
            case "Table" /* Table */: {
                const docTable = docNode;
                // GitHub's markdown renderer chokes on tables that don't have a blank line above them,
                // whereas VS Code's renderer is totally fine with it.
                writer.ensureSkippedLine();
                context.insideTable = true;
                if (docTable.cssClass) {
                    this._writeHTMLTable(writer, context, docTable);
                }
                else {
                    this._writeMarkdownTable(writer, context, docTable);
                }
                break;
            }
            case "EmphasisSpan" /* EmphasisSpan */: {
                const docEmphasisSpan = docNode;
                const oldBold = context.boldRequested;
                const oldItalic = context.italicRequested;
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
    writeLinkTagWithCodeDestination(docLinkTag, context) {
        const options = context.options;
        const result = this._apiModel.resolveDeclarationReference(docLinkTag.codeDestination, options.contextApiItem);
        if (result.resolvedApiItem) {
            const filename = options.onGetFilenameForApiItem(result.resolvedApiItem);
            if (filename) {
                let linkText = docLinkTag.linkText || '';
                if (linkText.length === 0) {
                    // Generate a name such as Namespace1.Namespace2.MyClass.myMethod()
                    linkText = result.resolvedApiItem.getScopedNameWithinPackage();
                }
                if (linkText.length > 0) {
                    const encodedLinkText = this.getEscapedText(linkText.replace(/\s+/g, ' '));
                    if (context.insideHTML) {
                        context.writer.write(`<a href='${filename.replace(/\.md$/, '/')}'>${encodedLinkText}</a>`);
                    }
                    else {
                        context.writer.write('[');
                        context.writer.write(encodedLinkText);
                        context.writer.write(`](${filename})`);
                    }
                }
                else {
                    console.log(colors.yellow('WARNING: Unable to determine link text'));
                }
            }
        }
        else if (result.errorMessage) {
            console.log(colors.yellow(`WARNING: Unable to resolve reference "${docLinkTag.codeDestination.emitAsTsdoc()}": ` +
                result.errorMessage));
        }
    }
    _writeMarkdownTable(writer, context, docTable) {
        // Markdown table rows can have inconsistent cell counts.  Size the table based on the longest row.
        let columnCount = 0;
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
        for (let i = 0; i < columnCount; ++i) {
            writer.write(' ');
            if (docTable.header) {
                const cell = docTable.header.cells[i];
                if (cell) {
                    this.writeNode(cell.content, context, false);
                }
            }
            writer.write(' |');
        }
        writer.writeLine();
        // write the divider
        writer.write('| ');
        for (let i = 0; i < columnCount; ++i) {
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
    _writeHTMLTable(writer, context, docTable) {
        context.insideHTML = true;
        let columnCount = 0;
        if (docTable.header) {
            columnCount = docTable.header.cells.length;
        }
        for (const row of docTable.rows) {
            if (row.cells.length > columnCount) {
                columnCount = row.cells.length;
            }
        }
        // write the table header
        writer.writeLine(`<table class="table table-hover ${docTable.cssClass}">`);
        writer.writeLine('  <thead>');
        writer.writeLine('    <tr>');
        writer.write('    ');
        for (let i = 0; i < columnCount; ++i) {
            writer.write(' ');
            if (docTable.header) {
                const cell = docTable.header.cells[i];
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
        writer.writeLine('</table>');
        writer.writeLine();
        context.insideTable = false;
        context.insideHTML = false;
    }
}
exports.CustomMarkdownEmitter = CustomMarkdownEmitter;
//# sourceMappingURL=CustomMarkdownEmitter.js.map
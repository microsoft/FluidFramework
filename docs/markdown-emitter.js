/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { MarkdownEmitter } = require("@fluid-tools/api-markdown-documenter");

/**
 * Custom {@link MarkdownEmitter} that generates HTML tables.
 *
 * @remarks Used by `./api-markdown-documenter.js`.
 */
class HugoMarkdownEmitter extends MarkdownEmitter {
    /**
     * @param {ApiModel} apiModel - See {@link @fluid-tools/api-markdown-documenter#MarkdownEmitter.apiModel}
     * @param {((contextApiItem: ApiItem) => string) | undefined} generateFrontMatter - See
     * {@link @fluid-tools/api-markdown-documenter#MarkdownEmitter.generateFrontMatter}
     */
    constructor(apiModel, generateFrontMatter) {
        super(apiModel, generateFrontMatter);
    }

    /**
     * Override base logic to handle plain-text rendering in HTML context.
     * Namely, we have to avoid escaping symbols.
     *
     * @override
     */
    writePlainText(text, context) {
        const writer = context.writer;

        // split out the [ leading whitespace, content, trailing whitespace ]
        const parts = text.match(/^(\s*)(.*?)(\s*)$/) || [];

        writer.write(parts[1]); // write leading whitespace

        const middle = parts[2];

        if (middle !== '') {
            switch (writer.peekLastCharacter()) {
                case '':
                case '\n':
                case ' ':
                case '[':
                case '>':
                    // okay to put a symbol
                    break;
                default:
                    // This is no problem:        "**one** *two* **three**"
                    // But this is trouble:       "**one***two***three**"
                    // The most general solution: "**one**<!-- -->*two*<!-- -->**three**"
                    writer.write('<!-- -->');
                    break;
            }

            if (context.boldRequested) {
                writer.write('<b>');
            }
            if (context.italicRequested) {
                writer.write('<i>');
            }

            if (context.insideHTML) {
                writer.write(middle);
            } else {
                writer.write(this.getEscapedText(middle));
            }

            if (context.italicRequested) {
                writer.write('</i>');
            }
            if (context.boldRequested) {
                writer.write('</b>');
            }
        }

        writer.write(parts[3]); // write trailing whitespace
    }

    /**
     * Override base logic to make use of Hugo callouts for note boxes.
     *
     * @override
     */
     writeAlert(docAlert, context) {
        const writer = context.writer;

        writer.ensureNewLine();

        writer.writeLine(`{{% callout ${docAlert.type ?? 'note'} ${docAlert.title ?? ''} %}}`);

        this.writeNode(docAlert.content, context, false);
        writer.ensureNewLine();

        writer.writeLine('{{% /callout %}}');
        writer.writeLine();
    }

    /**
     * Override base logic to make use of Hugo callouts for note boxes.
     *
     * @override
     */
    writeNoteBox(docNoteBox, context) {
        const writer = context.writer;

        writer.ensureNewLine();

        writer.writeLine('{{% callout note %}}');

        this.writeNode(docNoteBox.content, context, false);
        writer.ensureNewLine();

        writer.writeLine('{{% /callout %}}');
        writer.writeLine();
    }

    /**
     * Overrides base logic to write the provided table in HTML format.
     *
     * @param {DocTable} docTable - The table to be written.
     * @param {MarkdownEmitterContext} context - The Emitter context.
     *
     * @override
     */
    writeTable(docTable, context) {
        const writer = context.writer;
        const childContext = {
            ...context,
            insideHTML: true,
            insideTable: true,
        }

        let columnCount = 0;
        if (docTable.header) {
            columnCount = docTable.header.cells.length;
        }
        for (const row of docTable.rows) {
            if (row.cells.length > columnCount) {
                columnCount = row.cells.length;
            }
        }

        // Write the table header
        writer.writeLine(`<table class="table table-striped table-hover">`);
        writer.increaseIndent();
        writer.writeLine('<thead>');
        writer.increaseIndent();
        writer.writeLine('<tr>');
        writer.increaseIndent();
        for (let i = 0; i < columnCount; ++i) {
            if (docTable.header) {
                const cell = docTable.header.cells[i];
                if (cell) {
                    writer.writeLine('<th scope="col">');
                    writer.increaseIndent();
                    this.writeNode(cell.content, childContext, false);
                    writer.ensureNewLine();
                    writer.decreaseIndent();
                    writer.writeLine('</th>');
                }
            }
        }
        writer.decreaseIndent();
        writer.writeLine('</tr>');
        writer.decreaseIndent();
        writer.writeLine('</thead>');

        writer.writeLine('<tbody>');
        writer.increaseIndent();
        for (const row of docTable.rows) {
            writer.writeLine('<tr>');
            writer.increaseIndent();
            for (const cell of row.cells) {
                writer.writeLine('<td>');
                writer.increaseIndent();
                this.writeNode(cell.content, childContext, false);
                writer.ensureNewLine();
                writer.decreaseIndent();
                writer.writeLine('</td>');
            }
            writer.decreaseIndent();
            writer.writeLine('</tr>');
        }

        writer.decreaseIndent();
        writer.writeLine('</tbody>');
        writer.decreaseIndent();
        writer.writeLine('</table>')
        writer.writeLine();
    }

    /**
     * Writes the specified link.
     * If in an HTML context, the link will be written in HTML format.
     * Otherwise, it will be written as a standard Markdown-format link.
     *
     * @param {string} linkText - The display text of the link being written.
     * @param {string} linkTarget - The target URL of the link being written.
     * @param {MarkdownEmitterContext} context - The Emitter context.
     *
     * @override
     */
    writeLink(linkText, linkTarget, context) {
        if (context.insideHTML) {
            this.writeHtmlLink(linkText, linkTarget, context);
        } else {
            if(context.insideTable) {
                console.error("---MD LINK IN TABLE---");
            }
            super.writeLink(linkText, linkTarget, context);
        }
    }

    /**
     * Writes an HTML-formatted link for the given target and text.
     *
     * @param {string} linkText - The display text of the link being written.
     * @param {string} linkTarget - The target URL of the link being written.
     * @param {MarkdownEmitterContext} context - The Emitter context.
     */
    writeHtmlLink(linkText, linkTarget, context) {
        context.writer.write(`<a href='${linkTarget}'>${linkText}</a>`);
    }
}

module.exports = HugoMarkdownEmitter;

"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const tsdoc_1 = require("@microsoft/tsdoc");
const node_core_library_1 = require("@rushstack/node-core-library");
const IndentedWriter_1 = require("../utils/IndentedWriter");
/**
 * Renders MarkupElement content in the Markdown file format.
 * For more info:  https://en.wikipedia.org/wiki/Markdown
 */
class MarkdownEmitter {
    emit(stringBuilder, docNode, options) {
        const writer = new IndentedWriter_1.IndentedWriter(stringBuilder);
        const context = {
            writer,
            insideTable: false,
            insideHTML: false,
            boldRequested: false,
            italicRequested: false,
            writingBold: false,
            writingItalic: false,
            options
        };
        this.writeNode(docNode, context, false);
        writer.ensureNewLine(); // finish the last line
        return writer.toString();
    }
    getEscapedText(text) {
        const textWithBackslashes = text
            .replace(/\\/g, '\\\\') // first replace the escape character
            .replace(/[*#[\]_|`~]/g, (x) => '\\' + x) // then escape any special characters
            .replace(/---/g, '\\-\\-\\-') // hyphens only if it's 3 or more
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        return textWithBackslashes;
    }
    getTableEscapedText(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\|/g, '&#124;');
    }
    /**
     * @virtual
     */
    writeNode(docNode, context, docNodeSiblings) {
        const writer = context.writer;
        switch (docNode.kind) {
            case "PlainText" /* PlainText */: {
                const docPlainText = docNode;
                this.writePlainText(docPlainText.text, context);
                break;
            }
            case "HtmlStartTag" /* HtmlStartTag */:
            case "HtmlEndTag" /* HtmlEndTag */: {
                const docHtmlTag = docNode;
                // write the HTML element verbatim into the output
                writer.write(docHtmlTag.emitAsHtml());
                break;
            }
            case "CodeSpan" /* CodeSpan */: {
                const docCodeSpan = docNode;
                if (context.insideTable) {
                    writer.write('<code>');
                }
                else {
                    writer.write('`');
                }
                if (context.insideTable) {
                    const code = this.getTableEscapedText(docCodeSpan.code);
                    const parts = code.split(/\r?\n/g);
                    writer.write(parts.join('</code><br/><code>'));
                }
                else {
                    writer.write(docCodeSpan.code);
                }
                if (context.insideTable) {
                    writer.write('</code>');
                }
                else {
                    writer.write('`');
                }
                break;
            }
            case "LinkTag" /* LinkTag */: {
                const docLinkTag = docNode;
                if (docLinkTag.codeDestination) {
                    this.writeLinkTagWithCodeDestination(docLinkTag, context);
                }
                else if (docLinkTag.urlDestination) {
                    this.writeLinkTagWithUrlDestination(docLinkTag, context);
                }
                else if (docLinkTag.linkText) {
                    this.writePlainText(docLinkTag.linkText, context);
                }
                break;
            }
            case "Paragraph" /* Paragraph */: {
                const docParagraph = docNode;
                const trimmedParagraph = tsdoc_1.DocNodeTransforms.trimSpacesInParagraph(docParagraph);
                if (context.insideTable) {
                    if (docNodeSiblings) {
                        writer.write('<p>');
                        this.writeNodes(trimmedParagraph.nodes, context);
                        writer.write('</p>');
                    }
                    else {
                        // Special case:  If we are the only element inside this table cell, then we can omit the <p></p> container.
                        this.writeNodes(trimmedParagraph.nodes, context);
                    }
                }
                else {
                    this.writeNodes(trimmedParagraph.nodes, context);
                    writer.ensureNewLine();
                    writer.writeLine();
                }
                break;
            }
            case "FencedCode" /* FencedCode */: {
                const docFencedCode = docNode;
                writer.ensureNewLine();
                writer.write('```');
                writer.write(docFencedCode.language);
                writer.writeLine();
                writer.write(docFencedCode.code);
                writer.writeLine();
                writer.writeLine('```');
                break;
            }
            case "Section" /* Section */: {
                const docSection = docNode;
                this.writeNodes(docSection.nodes, context);
                break;
            }
            case "SoftBreak" /* SoftBreak */: {
                if (!/^\s?$/.test(writer.peekLastCharacter())) {
                    writer.write(' ');
                }
                break;
            }
            case "EscapedText" /* EscapedText */: {
                const docEscapedText = docNode;
                this.writePlainText(docEscapedText.decodedText, context);
                break;
            }
            case "ErrorText" /* ErrorText */: {
                const docErrorText = docNode;
                this.writePlainText(docErrorText.text, context);
                break;
            }
            case "InlineTag" /* InlineTag */: {
                break;
            }
            case "BlockTag" /* BlockTag */: {
                const tagNode = docNode;
                console.warn('Unsupported block tag: ' + tagNode.tagName);
                break;
            }
            default:
                throw new node_core_library_1.InternalError('Unsupported DocNodeKind kind: ' + docNode.kind);
        }
    }
    /** @virtual */
    writeLinkTagWithCodeDestination(docLinkTag, context) {
        // The subclass needs to implement this to support code destinations
        throw new node_core_library_1.InternalError('writeLinkTagWithCodeDestination()');
    }
    /** @virtual */
    writeLinkTagWithUrlDestination(docLinkTag, context) {
        const linkText = docLinkTag.linkText !== undefined ? docLinkTag.linkText : docLinkTag.urlDestination;
        const encodedLinkText = this.getEscapedText(linkText.replace(/\s+/g, ' '));
        if (context.insideHTML) {
            context.writer.write(`<a href='${docLinkTag.urlDestination.replace(/\.md$/, '/')}'>${encodedLinkText}</a>`);
        }
        else {
            context.writer.write('[');
            context.writer.write(encodedLinkText);
            context.writer.write(`](${docLinkTag.urlDestination})`);
        }
    }
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
            writer.write(this.getEscapedText(middle));
            if (context.italicRequested) {
                writer.write('</i>');
            }
            if (context.boldRequested) {
                writer.write('</b>');
            }
        }
        writer.write(parts[3]); // write trailing whitespace
    }
    writeNodes(docNodes, context) {
        for (const docNode of docNodes) {
            this.writeNode(docNode, context, docNodes.length > 1);
        }
    }
}
exports.MarkdownEmitter = MarkdownEmitter;
//# sourceMappingURL=MarkdownEmitter.js.map
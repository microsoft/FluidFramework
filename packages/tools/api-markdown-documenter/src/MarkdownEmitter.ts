/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    IMarkdownEmitterOptions as BaseEmitterOptions,
    MarkdownEmitter as BaseMarkdownEmitter,
    IMarkdownEmitterContext,
} from "@microsoft/api-documenter/lib/markdown/MarkdownEmitter";
import { IndentedWriter } from "@microsoft/api-documenter/lib/utils/IndentedWriter";
import {
    ApiItem,
    ApiModel,
    IResolveDeclarationReferenceResult,
} from "@microsoft/api-extractor-model";
import { DocLinkTag, DocNode, DocNodeKind, StringBuilder } from "@microsoft/tsdoc";

import { logWarning } from "./LoggingUtilities";
import { DocEmphasisSpan, DocHeading, DocNoteBox, DocTable, DocTableCell } from "./doc-nodes";
import { CustomDocNodeKind } from "./doc-nodes/CustomDocNodeKind";

/**
 * {@link MarkdownEmitter} options.
 */
export interface EmitterOptions extends BaseEmitterOptions {
    /**
     * The root item of the documentation node tree being emitted.
     */
    contextApiItem: ApiItem | undefined;

    /**
     * Callback to get the link URL for the specified API item.
     *
     * @remarks Used when resolving member links.
     */
    getLinkUrlApiItem: (apiItem: ApiItem) => string | undefined;

    /**
     * Contextual heading level.
     * Will automatically increment based on `Section` items encountered such that heading
     * levels can be increased automatically based on content hierarchy.
     *
     * @remarks
     * When invoking the Emitter externally, this should be set to 0 to represent having not entered any `Section`s yet.
     *
     * @defaultValue 0
     */
    headingLevel?: number;
}

/**
 * Context used by {@link MarkdownEmitter.emit}.
 */
export type EmitterContext = IMarkdownEmitterContext<EmitterOptions>;

/**
 * Markdown documentation emitter.
 * Processes an input tree of documentation related to an API model, and generates Markdown content from it.
 */
export class MarkdownEmitter extends BaseMarkdownEmitter {
    protected readonly apiModel: ApiModel;

    public constructor(apiModel: ApiModel) {
        super();
        this.apiModel = apiModel;
    }

    /**
     * @override
     */
    public emit(stringBuilder: StringBuilder, docNode: DocNode, options: EmitterOptions): string {
        return super.emit(stringBuilder, docNode, options);
    }

    /**
     * @override
     */
    protected writeNode(docNode: DocNode, context: EmitterContext, docNodeSiblings: boolean): void {
        switch (docNode.kind) {
            case DocNodeKind.Section: {
                // Whenever we encounter a `Section` item, increase the contextual heading level
                super.writeNode(
                    docNode,
                    contextWithIncrementedHeadingLevel(context),
                    docNodeSiblings,
                );
                break;
            }
            case CustomDocNodeKind.Heading: {
                this.writeHeading(docNode as DocHeading, context, docNodeSiblings);
                break;
            }
            case CustomDocNodeKind.NoteBox: {
                this.writeNoteBox(docNode as DocNoteBox, context, docNodeSiblings);
                break;
            }
            case CustomDocNodeKind.Table: {
                this.writeTable(docNode as DocTable, context, docNodeSiblings);
                break;
            }
            case CustomDocNodeKind.EmphasisSpan: {
                this.writeEmphasisSpan(docNode as DocEmphasisSpan, context, docNodeSiblings);
                break;
            }
            default:
                super.writeNode(docNode, context, false);
                break;
        }
    }

    /**
     * @override
     * @virtual
     */
    protected writeLinkTagWithCodeDestination(
        docLinkTag: DocLinkTag,
        context: EmitterContext,
    ): void {
        if (docLinkTag.codeDestination === undefined) {
            throw new Error(
                "Code destination function was called for a link tag with no code destination.",
            );
        }

        const options: EmitterOptions = context.options;

        const result: IResolveDeclarationReferenceResult =
            this.apiModel.resolveDeclarationReference(
                docLinkTag.codeDestination,
                options.contextApiItem,
            );

        if (result.resolvedApiItem !== undefined) {
            const linkUrl = options.getLinkUrlApiItem(result.resolvedApiItem);

            if (linkUrl !== undefined) {
                let linkText: string = docLinkTag.linkText || "";
                if (linkText.length === 0) {
                    // Generate a name such as Namespace1.Namespace2.MyClass.myMethod()
                    linkText = result.resolvedApiItem.getScopedNameWithinPackage();
                }
                if (linkText.length > 0) {
                    const encodedLinkText: string = this.getEscapedText(
                        linkText.replace(/\s+/g, " "),
                    );
                    context.writer.write("[");
                    context.writer.write(encodedLinkText);
                    context.writer.write(`](${linkUrl})`);
                } else {
                    logWarning("Unable to determine link text");
                }
            }
        } else if (result.errorMessage) {
            const elementText = docLinkTag.codeDestination.emitAsTsdoc();
            logWarning(`Unable to resolve reference "${elementText}": ` + result.errorMessage);

            // Emit item as simple italicized text, so that at least something appears in the generated output
            context.writer.write(
                `*${docLinkTag.linkText === undefined ? elementText : docLinkTag.linkText}*`,
            );
        }
    }

    /**
     * @virtual
     */
    protected writeEmphasisSpan(
        docEmphasisSpan: DocEmphasisSpan,
        context: EmitterContext,
        docNodeSiblings: boolean,
    ): void {
        this.writeNodes(docEmphasisSpan.nodes, {
            ...context,
            boldRequested: docEmphasisSpan.bold,
            italicRequested: docEmphasisSpan.italic,
        });
    }

    /**
     * @virtual
     */
    protected writeHeading(
        docHeading: DocHeading,
        context: EmitterContext,
        docNodeSiblings: boolean,
    ): void {
        const writer: IndentedWriter = context.writer;

        writer.ensureSkippedLine();

        let prefix: string;
        const headingLevel = docHeading.level ?? context.options.headingLevel ?? 1;
        switch (headingLevel) {
            case 1:
                prefix = "#";
                break;
            case 2:
                prefix = "##";
                break;
            case 3:
                prefix = "###";
                break;
            case 4:
                prefix = "####";
                break;
            case 5:
                prefix = "#####";
                break;
            case 6:
                prefix = "######";
                break;
            default:
                // If the heading level is beyond the max, we will simply render the title as bolded text
                super.writePlainText(docHeading.title, {
                    ...context,
                    boldRequested: true,
                });
                writer.writeLine();
                writer.writeLine();
                return;
        }
        let suffix: string = "";
        if (docHeading.id) {
            suffix = ` {#${docHeading.id}}`;
        }

        writer.writeLine(prefix + " " + this.getEscapedText(docHeading.title) + suffix);
        writer.writeLine();
    }

    /**
     * @virtual
     */
    protected writeNoteBox(
        docNoteBox: DocNoteBox,
        context: EmitterContext,
        docNodeSiblings: boolean,
    ): void {
        const writer: IndentedWriter = context.writer;

        writer.ensureNewLine();

        writer.increaseIndent("> ");

        this.writeNode(docNoteBox.content, context, docNodeSiblings);
        writer.ensureNewLine();

        writer.decreaseIndent();

        writer.writeLine();
    }

    /**
     * @virtual
     */
    protected writeTable(
        docTable: DocTable,
        context: EmitterContext,
        docNodeSiblings: boolean,
    ): void {
        const writer: IndentedWriter = context.writer;

        // GitHub's markdown renderer chokes on tables that don't have a blank line above them,
        // whereas VS Code's renderer is totally fine with it.
        writer.ensureSkippedLine();

        const childContext: EmitterContext = {
            ...context,
            insideTable: true,
        };

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
                    this.writeNode(cell.content, childContext, false);
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
                this.writeNode(cell.content, childContext, false);
                writer.write(" |");
            }
            writer.writeLine();
        }
        writer.writeLine();
    }
}

function contextWithIncrementedHeadingLevel(context: EmitterContext): EmitterContext {
    return {
        ...context,
        options: {
            ...context.options,
            headingLevel: (context.options.headingLevel ?? 0) + 1,
        },
    };
}

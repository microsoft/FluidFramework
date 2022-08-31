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

import { logError, logWarning } from "./LoggingUtilities";
import { MarkdownDocument } from "./MarkdownDocument";
import {
    MarkdownDocumenterConfiguration,
    markdownDocumenterConfigurationWithDefaults,
} from "./MarkdownDocumenterConfiguration";
import {
    DocEmphasisSpan,
    DocHeading,
    DocList,
    DocNoteBox,
    DocTable,
    DocTableCell,
    ListKind,
} from "./doc-nodes";
import { CustomDocNodeKind } from "./doc-nodes/CustomDocNodeKind";
import { getLinkUrlForApiItem } from "./utilities";

/**
 * Maximum heading level supported by most systems.
 *
 * @remarks This corresponds with the max HTML heading level.
 */
export const maxHeadingLevel = 6;

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
    /**
     * The top-level model representing the code suite being processed.
     *
     * @remarks Can be used to resolve links between API members.
     */
    protected readonly apiModel: ApiModel;

    public constructor(apiModel: ApiModel) {
        super();
        this.apiModel = apiModel;
    }

    /**
     * Emits Markdown content as a `string` based on the input doc tree (`docNode`).
     *
     * @override
     * @virtual
     */
    public emit(stringBuilder: StringBuilder, docNode: DocNode, options: EmitterOptions): string {
        return super.emit(stringBuilder, docNode, options).trim();
    }

    /**
     * Writes Markdown content for the provided `docNode`.
     *
     * @remarks The `docNode`'s `kind` property is used to determine the underlying kind of doc content.
     *
     * @override
     * @virtual
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
            case CustomDocNodeKind.List: {
                this.writeList(docNode as DocList, context, docNodeSiblings);
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
                super.writeNode(docNode, context, docNodeSiblings);
                break;
        }
    }

    /**
     * Writes a Markdown link for the provided `docLinkTag` if possible, otherwise writes plain text (in italics) if
     * the item being linked to cannot be resolved.
     *
     * @remarks {@link MarkdownEmitter.apiModel} can be used to resolve links between API members.
     *
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
                let rawLinkText = docLinkTag.linkText;
                if (rawLinkText === undefined || rawLinkText.length === 0) {
                    // Generate a name such as Namespace1.Namespace2.MyClass.myMethod()
                    rawLinkText = result.resolvedApiItem.getScopedNameWithinPackage();
                }
                if (rawLinkText.length > 0) {
                    this.writeLink(
                        this.getEscapedText(rawLinkText.replace(/\s+/g, " ")),
                        linkUrl,
                        context,
                    );
                } else {
                    logWarning("Unable to determine link text");
                }
            }
        } else if (result.errorMessage) {
            const elementText = docLinkTag.codeDestination.emitAsTsdoc();
            logWarning(`Unable to resolve reference "${elementText}": ` + result.errorMessage);

            // Emit item as simple italicized text, so that at least something appears in the generated output
            this.writePlainText(
                docLinkTag.linkText === undefined ? elementText : docLinkTag.linkText,
                { ...context, italicRequested: true },
            );
        }
    }

    /**
     * Writes a Markdown link for the provided `docLinkTag` if possible, otherwise writes plain text (in italics) if
     * the item being linked to cannot be resolved.
     *
     * @remarks {@link MarkdownEmitter.apiModel} can be used to resolve links between API members.
     *
     * @override
     * @virtual
     */
    protected writeLinkTagWithUrlDestination(
        docLinkTag: DocLinkTag,
        context: EmitterContext,
    ): void {
        if (docLinkTag.urlDestination === undefined) {
            throw new Error("URL link function was called for link with no URL target.");
        }

        const rawLinkText =
            docLinkTag.linkText !== undefined ? docLinkTag.linkText : docLinkTag.urlDestination;

        return this.writeLink(rawLinkText.replace(/\s+/g, " "), docLinkTag.urlDestination, context);
    }

    /**
     * Writes a Markdown link for the provided link text and target.
     *
     * @virtual
     */
    protected writeLink(linkText: string, linkTarget: string, context: EmitterContext): void {
        context.writer.write(`[${linkText}](${linkTarget})`);
    }

    /**
     * Writes Markdown content for the provided `docEmphasisSpan`.
     *
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
     * Writes Markdown content for the provided `docHeading`.
     *
     * @virtual
     */
    protected writeHeading(
        docHeading: DocHeading,
        context: EmitterContext,
        docNodeSiblings: boolean,
    ): void {
        const writer: IndentedWriter = context.writer;

        writer.ensureSkippedLine();

        let headingLevel = docHeading.level ?? context.options.headingLevel ?? 1;
        if (headingLevel <= 0) {
            logError(
                `Cannot render a heading level less than 1. Got ${headingLevel}. Will use 1 instead.`,
            );
            headingLevel = 1;
        }

        if (headingLevel <= maxHeadingLevel) {
            const prefix = "#".repeat(headingLevel);
            let suffix: string = "";
            if (docHeading.id) {
                suffix = ` {#${docHeading.id}}`;
            }

            writer.writeLine(prefix + " " + this.getEscapedText(docHeading.title) + suffix);
            writer.writeLine();
        } else {
            // If the heading level is beyond the max, we will simply render the title as bolded text
            super.writePlainText(docHeading.title, {
                ...context,
                boldRequested: true,
            });
            writer.writeLine();
            writer.writeLine();
        }
    }

    /**
     * Writes Markdown content for the provided `docList`.
     *
     * @virtual
     */
    protected writeList(docList: DocList, context: EmitterContext, docNodeSiblings: boolean): void {
        const writer: IndentedWriter = context.writer;

        writer.ensureSkippedLine();

        for (let i = 0; i < docList.nodes.length; i++) {
            let listSymbol: string;
            switch (docList.listKind) {
                case ListKind.Ordered:
                    listSymbol = `${i + 1}.`;
                    break;
                case ListKind.Unordered:
                    listSymbol = "*";
                    break;
                default:
                    throw new Error(`Uncrecognized ListKind value: "${docList.kind}".`);
            }

            writer.write(`${listSymbol} `);
            this.writeNode(docList.nodes[i], context, docList.nodes.length !== 1);
            writer.ensureNewLine();
        }
    }

    /**
     * Writes Markdown content for the provided `docNoteBox`.
     *
     * @virtual
     */
    protected writeNoteBox(
        docNoteBox: DocNoteBox,
        context: EmitterContext,
        docNodeSiblings: boolean,
    ): void {
        const writer: IndentedWriter = context.writer;

        writer.ensureSkippedLine();

        writer.increaseIndent("> ");

        this.writeNode(docNoteBox.content, context, docNodeSiblings);

        writer.decreaseIndent();

        writer.ensureSkippedLine();
    }

    /**
     * Writes Markdown content for the provided `docTable`.
     *
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

/**
 * Generates a child context with the {@link EmitterContext.headingLevel} incremented by 1.
 */
function contextWithIncrementedHeadingLevel(context: EmitterContext): EmitterContext {
    return {
        ...context,
        options: {
            ...context.options,
            headingLevel: (context.options.headingLevel ?? 0) + 1,
        },
    };
}

/**
 * Emits Markdown content for the specified `docNode`
 *
 * @param document - The document to be emitted.
 * @param partialConfig - See {@link MarkdownDocumenterConfiguration}.
 * @param markdownEmitter - An optional {@link MarkdownEmitter} instance.
 * Can be used to provide a custom emitter implementation.
 * If not provided, a new instance of `MarkdownEmitter` will be generated from the provided configuration's
 * {@link MarkdownDocumenterConfiguration.apiModel}.
 */
export function emitMarkdown(
    document: MarkdownDocument,
    partialConfig: MarkdownDocumenterConfiguration,
    markdownEmitter?: MarkdownEmitter,
): string {
    const config = markdownDocumenterConfigurationWithDefaults(partialConfig);

    markdownEmitter = markdownEmitter ?? new MarkdownEmitter(config.apiModel);

    return markdownEmitter.emit(new StringBuilder(), document.contents, {
        contextApiItem: document.apiItem,
        getLinkUrlApiItem: (_apiItem) => getLinkUrlForApiItem(_apiItem, config),
    });
}

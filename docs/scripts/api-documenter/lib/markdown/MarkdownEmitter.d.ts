import { DocNode, StringBuilder, DocLinkTag } from '@microsoft/tsdoc';
import { IndentedWriter } from '../utils/IndentedWriter';
export interface IMarkdownEmitterOptions {
}
export interface IMarkdownEmitterContext<TOptions = IMarkdownEmitterOptions> {
    writer: IndentedWriter;
    insideTable: boolean;
    boldRequested: boolean;
    italicRequested: boolean;
    writingBold: boolean;
    writingItalic: boolean;
    options: TOptions;
}
/**
 * Renders MarkupElement content in the Markdown file format.
 * For more info:  https://en.wikipedia.org/wiki/Markdown
 */
export declare class MarkdownEmitter {
    emit(stringBuilder: StringBuilder, docNode: DocNode, options: IMarkdownEmitterOptions): string;
    protected getEscapedText(text: string): string;
    protected getTableEscapedText(text: string): string;
    /**
     * @virtual
     */
    protected writeNode(docNode: DocNode, context: IMarkdownEmitterContext, docNodeSiblings: boolean): void;
    /** @virtual */
    protected writeLinkTagWithCodeDestination(docLinkTag: DocLinkTag, context: IMarkdownEmitterContext): void;
    /** @virtual */
    protected writeLinkTagWithUrlDestination(docLinkTag: DocLinkTag, context: IMarkdownEmitterContext): void;
    protected writePlainText(text: string, context: IMarkdownEmitterContext): void;
    protected writeNodes(docNodes: ReadonlyArray<DocNode>, context: IMarkdownEmitterContext): void;
}
//# sourceMappingURL=MarkdownEmitter.d.ts.map
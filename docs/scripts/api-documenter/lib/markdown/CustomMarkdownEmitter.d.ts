import { DocNode, DocLinkTag, StringBuilder } from '@microsoft/tsdoc';
import { ApiModel, ApiItem } from '@microsoft/api-extractor-model';
import { MarkdownEmitter, IMarkdownEmitterContext, IMarkdownEmitterOptions } from './MarkdownEmitter';
export interface ICustomMarkdownEmitterOptions extends IMarkdownEmitterOptions {
    contextApiItem: ApiItem | undefined;
    onGetFilenameForApiItem: (apiItem: ApiItem) => string | undefined;
}
export declare class CustomMarkdownEmitter extends MarkdownEmitter {
    private _apiModel;
    constructor(apiModel: ApiModel);
    emit(stringBuilder: StringBuilder, docNode: DocNode, options: ICustomMarkdownEmitterOptions): string;
    /** @override */
    protected writeNode(docNode: DocNode, context: IMarkdownEmitterContext, docNodeSiblings: boolean): void;
    /** @override */
    protected writeLinkTagWithCodeDestination(docLinkTag: DocLinkTag, context: IMarkdownEmitterContext<ICustomMarkdownEmitterOptions>): void;
}
//# sourceMappingURL=CustomMarkdownEmitter.d.ts.map
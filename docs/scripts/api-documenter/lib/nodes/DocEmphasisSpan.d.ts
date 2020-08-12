import { DocNode, DocNodeContainer, IDocNodeContainerParameters } from '@microsoft/tsdoc';
/**
 * Constructor parameters for {@link DocEmphasisSpan}.
 */
export interface IDocEmphasisSpanParameters extends IDocNodeContainerParameters {
    bold?: boolean;
    italic?: boolean;
}
/**
 * Represents a span of text that is styled with CommonMark emphasis (italics), strong emphasis (boldface),
 * or both.
 */
export declare class DocEmphasisSpan extends DocNodeContainer {
    readonly bold: boolean;
    readonly italic: boolean;
    constructor(parameters: IDocEmphasisSpanParameters, children?: DocNode[]);
    /** @override */
    readonly kind: string;
}
//# sourceMappingURL=DocEmphasisSpan.d.ts.map
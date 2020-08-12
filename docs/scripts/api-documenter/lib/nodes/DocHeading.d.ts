import { IDocNodeParameters, DocNode } from '@microsoft/tsdoc';
/**
 * Constructor parameters for {@link DocHeading}.
 */
export interface IDocHeadingParameters extends IDocNodeParameters {
    title: string;
    level?: number;
}
/**
 * Represents a section header similar to an HTML `<h1>` or `<h2>` element.
 */
export declare class DocHeading extends DocNode {
    readonly title: string;
    readonly level: number;
    /**
     * Don't call this directly.  Instead use {@link TSDocParser}
     * @internal
     */
    constructor(parameters: IDocHeadingParameters);
    /** @override */
    readonly kind: string;
}
//# sourceMappingURL=DocHeading.d.ts.map
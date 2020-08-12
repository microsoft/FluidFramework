import { ApiItem } from '@microsoft/api-extractor-model';
/** @internal */
export interface IMarkdownDocumenterAccessorImplementation {
    getLinkForApiItem(apiItem: ApiItem): string | undefined;
}
/**
 * Provides access to the documenter that is generating the output.
 *
 * @privateRemarks
 * This class is wrapper that provides access to the underlying MarkdownDocumenter, while hiding the implementation
 * details to ensure that the plugin API contract is stable.
 *
 * @public
 */
export declare class MarkdownDocumenterAccessor {
    private _implementation;
    /** @internal */
    constructor(implementation: IMarkdownDocumenterAccessorImplementation);
    /**
     * For a given `ApiItem`, return its markdown hyperlink.
     *
     * @returns The hyperlink, or `undefined` if the `ApiItem` object does not have a hyperlink.
     */
    getLinkForApiItem(apiItem: ApiItem): string | undefined;
}
//# sourceMappingURL=MarkdownDocumenterAccessor.d.ts.map
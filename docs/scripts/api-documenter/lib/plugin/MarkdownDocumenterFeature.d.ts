import { PluginFeature } from './PluginFeature';
import { ApiItem, ApiModel } from '@microsoft/api-extractor-model';
import { MarkdownDocumenterAccessor } from './MarkdownDocumenterAccessor';
/**
 * Context object for {@link MarkdownDocumenterFeature}.
 * Exposes various services that can be used by a plugin.
 *
 * @public
 */
export declare class MarkdownDocumenterFeatureContext {
    /**
     * Provides access to the `ApiModel` for the documentation being generated.
     */
    readonly apiModel: ApiModel;
    /**
     * The full path to the output folder.
     */
    readonly outputFolder: string;
    /**
     * Exposes functionality of the documenter.
     */
    readonly documenter: MarkdownDocumenterAccessor;
    /** @internal */
    constructor(options: MarkdownDocumenterFeatureContext);
}
/**
 * Event arguments for MarkdownDocumenterFeature.onBeforeWritePage()
 * @public
 */
export interface IMarkdownDocumenterFeatureOnBeforeWritePageArgs {
    /**
     * The API item corresponding to this page.
     */
    readonly apiItem: ApiItem;
    /**
     * The page content.  The {@link MarkdownDocumenterFeature.onBeforeWritePage} handler can reassign this
     * string to customize the page appearance.
     */
    pageContent: string;
    /**
     * The filename where the output will be written.
     */
    readonly outputFilename: string;
}
/**
 * Event arguments for MarkdownDocumenterFeature.onFinished()
 * @public
 */
export interface IMarkdownDocumenterFeatureOnFinishedArgs {
}
/**
 * Inherit from this base class to implement an API Documenter plugin feature that customizes
 * the generation of markdown output.
 *
 * @public
 */
export declare class MarkdownDocumenterFeature extends PluginFeature {
    /** {@inheritdoc PluginFeature.context} */
    context: MarkdownDocumenterFeatureContext;
    /**
     * This event occurs before each markdown file is written.  It provides an opportunity to customize the
     * content of the file.
     * @virtual
     */
    onBeforeWritePage(eventArgs: IMarkdownDocumenterFeatureOnBeforeWritePageArgs): void;
    /**
     * This event occurs after all output files have been written.
     * @virtual
     */
    onFinished(eventArgs: IMarkdownDocumenterFeatureOnFinishedArgs): void;
}
//# sourceMappingURL=MarkdownDocumenterFeature.d.ts.map
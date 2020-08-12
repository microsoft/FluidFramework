import { MarkdownDocumenterFeature, IMarkdownDocumenterFeatureOnBeforeWritePageArgs, IMarkdownDocumenterFeatureOnFinishedArgs } from '@microsoft/api-documenter';
export declare class FluidFeature extends MarkdownDocumenterFeature {
    private _apiItemsWithPages;
    private _tsdocConfiguration;
    private _markdownEmitter;
    onInitialized(): void;
    onBeforeWritePage(eventArgs: IMarkdownDocumenterFeatureOnBeforeWritePageArgs): void;
    onFinished(eventArgs: IMarkdownDocumenterFeatureOnFinishedArgs): void;
    private _pageTitle;
    private _buildNavigation;
    private _customContent;
    private _writeBreadcrumb;
}
//# sourceMappingURL=FluidFeature.d.ts.map
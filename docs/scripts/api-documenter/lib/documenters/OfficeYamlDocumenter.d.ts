import { ApiModel } from '@microsoft/api-extractor-model';
import { IYamlTocItem } from '../yaml/IYamlTocFile';
import { IYamlItem } from '../yaml/IYamlApiFile';
import { YamlDocumenter } from './YamlDocumenter';
/**
 * Extends YamlDocumenter with some custom logic that is specific to Office Add-ins.
 */
export declare class OfficeYamlDocumenter extends YamlDocumenter {
    private _snippets;
    private _snippetsAll;
    private _apiSetUrlDefault;
    private _apiSetUrls;
    constructor(apiModel: ApiModel, inputFolder: string, newDocfxNamespaces?: boolean);
    /** @override */
    generateFiles(outputFolder: string): void;
    /** @override */
    protected onGetTocRoot(): IYamlTocItem;
    /** @override */
    protected onCustomizeYamlItem(yamlItem: IYamlItem): void;
    private _fixupApiSet;
    private _getApiSetUrl;
    private _fixBoldAndItalics;
    private _generateExampleSnippetText;
}
//# sourceMappingURL=OfficeYamlDocumenter.d.ts.map
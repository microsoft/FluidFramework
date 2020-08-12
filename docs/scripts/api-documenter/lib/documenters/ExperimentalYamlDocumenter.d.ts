import { ApiModel, ApiItem } from '@microsoft/api-extractor-model';
import { IYamlTocFile } from '../yaml/IYamlTocFile';
import { YamlDocumenter } from './YamlDocumenter';
import { DocumenterConfig } from './DocumenterConfig';
/**
 * EXPERIMENTAL - This documenter is a prototype of a new config file driven mode of operation for
 * API Documenter.  It is not ready for general usage yet.  Its design may change in the future.
 */
export declare class ExperimentalYamlDocumenter extends YamlDocumenter {
    private _config;
    private _tocPointerMap;
    private _catchAllPointer;
    constructor(apiModel: ApiModel, documenterConfig: DocumenterConfig);
    /** @override */
    protected buildYamlTocFile(apiItems: ReadonlyArray<ApiItem>): IYamlTocFile;
    private _buildTocItems2;
    private _generateTocPointersMap;
    /**
     * Filtering out the api-item by inlineTags or category name presence in the item name.
     */
    private _filterItem;
    private _findInlineTagByName;
    private _shouldNotIncludeInPointersMap;
}
//# sourceMappingURL=ExperimentalYamlDocumenter.d.ts.map
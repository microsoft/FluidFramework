import { ApiModel, ApiItem, ApiItemKind } from '@microsoft/api-extractor-model';
import { DeclarationReference } from '@microsoft/tsdoc/lib/beta/DeclarationReference';
import { IYamlItem } from '../yaml/IYamlApiFile';
import { IYamlTocFile, IYamlTocItem } from '../yaml/IYamlTocFile';
/**
 * Writes documentation in the Universal Reference YAML file format, as defined by typescript.schema.json.
 */
export declare class YamlDocumenter {
    protected readonly newDocfxNamespaces: boolean;
    private readonly _apiModel;
    private readonly _markdownEmitter;
    private _apiItemsByCanonicalReference;
    private _yamlReferences;
    private _outputFolder;
    constructor(apiModel: ApiModel, newDocfxNamespaces?: boolean);
    /** @virtual */
    generateFiles(outputFolder: string): void;
    /** @virtual */
    protected onGetTocRoot(): IYamlTocItem;
    /** @virtual */
    protected onCustomizeYamlItem(yamlItem: IYamlItem): void;
    private _visitApiItems;
    protected _getLogicalChildren(apiItem: ApiItem): ApiItem[];
    private _flattenNamespaces;
    /**
     * Write the table of contents
     */
    private _writeTocFile;
    /** @virtual */
    protected buildYamlTocFile(apiItems: ReadonlyArray<ApiItem>): IYamlTocFile;
    private _buildTocItems;
    /** @virtual */
    protected _getTocItemName(apiItem: ApiItem): string;
    protected _shouldEmbed(apiItemKind: ApiItemKind): boolean;
    protected _shouldInclude(apiItemKind: ApiItemKind): boolean;
    private _generateYamlItem;
    private _populateYamlTypeParameters;
    private _populateYamlClassOrInterface;
    private _populateYamlFunctionLike;
    private _populateYamlProperty;
    private _populateYamlVariable;
    private _populateYamlTypeAlias;
    private _renderMarkdown;
    private _writeYamlFile;
    /**
     * Calculate the DocFX "uid" for the ApiItem
     * Example:  `node-core-library!JsonFile#load`
     */
    protected _getUid(apiItem: ApiItem): string;
    protected _getUidObject(apiItem: ApiItem): DeclarationReference;
    /**
     * Initialize the _apiItemsByCanonicalReference data structure.
     */
    private _initApiItems;
    /**
     * Helper for _initApiItems()
     */
    private _initApiItemsRecursive;
    private _ensureYamlReferences;
    private _renderInheritance;
    private _renderType;
    private _recordYamlReference;
    private _getYamlItemName;
    private _getYamlFilePath;
    private _deleteOldOutputFiles;
}
//# sourceMappingURL=YamlDocumenter.d.ts.map
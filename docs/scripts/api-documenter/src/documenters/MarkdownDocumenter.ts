// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { PackageName, FileSystem, NewlineKind } from '@rushstack/node-core-library';
import {
    DocSection,
    DocPlainText,
    DocLinkTag,
    TSDocConfiguration,
    StringBuilder,
    DocNodeKind,
    DocParagraph,
    DocCodeSpan,
    DocFencedCode,
    StandardTags,
    DocBlock,
    DocComment,
    DocNodeContainer,
    DocHtmlStartTag,
    DocHtmlEndTag,
    DocHtmlAttribute
} from '@microsoft/tsdoc';
import {
    ApiModel,
    ApiItem,
    ApiEnum,
    ApiPackage,
    ApiItemKind,
    ApiReleaseTagMixin,
    ApiDocumentedItem,
    ApiClass,
    ReleaseTag,
    ApiStaticMixin,
    ApiPropertyItem,
    ApiInterface,
    Excerpt,
    ApiParameterListMixin,
    ApiReturnTypeMixin,
    ApiDeclaredItem,
    ApiNamespace,
    ExcerptTokenKind,
    IResolveDeclarationReferenceResult
} from '@microsoft/api-extractor-model';

import { CustomDocNodes } from '../nodes/CustomDocNodeKind';
import { DocHeading } from '../nodes/DocHeading';
import { DocTable } from '../nodes/DocTable';
import { DocEmphasisSpan } from '../nodes/DocEmphasisSpan';
import { DocTableRow } from '../nodes/DocTableRow';
import { DocTableCell } from '../nodes/DocTableCell';
import { DocNoteBox } from '../nodes/DocNoteBox';
import { Utilities } from '../utils/Utilities';
import { CustomMarkdownEmitter } from '../markdown/CustomMarkdownEmitter';
import { PluginLoader } from '../plugin/PluginLoader';
import {
    IMarkdownDocumenterFeatureOnBeforeWritePageArgs,
    MarkdownDocumenterFeatureContext
} from '../plugin/MarkdownDocumenterFeature';
import { DocumenterConfig } from './DocumenterConfig';
import { MarkdownDocumenterAccessor } from '../plugin/MarkdownDocumenterAccessor';
import { FrontMatter } from './FrontMatter';
//import { getHeapStatistics } from 'v8';

/**
 * Renders API documentation in the Markdown file format.
 * For more info:  https://en.wikipedia.org/wiki/Markdown
 */
export class MarkdownDocumenter {
    private readonly _apiModel: ApiModel;
    private readonly _documenterConfig: DocumenterConfig | undefined;
    private readonly _tsdocConfiguration: TSDocConfiguration;
    private readonly _markdownEmitter: CustomMarkdownEmitter;
    private _outputFolder: string;
    private readonly _pluginLoader: PluginLoader;
    private _frontMatter: FrontMatter;
    private _currentApiItemPage: ApiItem;
    private readonly _uriRoot: string;

    public constructor(apiModel: ApiModel, documenterConfig: DocumenterConfig | undefined) {
        this._apiModel = apiModel;
        this._documenterConfig = documenterConfig;
        this._tsdocConfiguration = CustomDocNodes.configuration;
        this._markdownEmitter = new CustomMarkdownEmitter(this._apiModel);
        this._frontMatter = new FrontMatter();

        this._pluginLoader = new PluginLoader();

        this._uriRoot = '/';
        if (this._documenterConfig && this._documenterConfig.uriRoot !== undefined) {
            this._uriRoot = this._documenterConfig.uriRoot! + '/';
        }
    }

    public generateFiles(outputFolder: string): void {
        this._outputFolder = outputFolder;

        if (this._documenterConfig) {
            this._pluginLoader.load(this._documenterConfig, () => {
                return new MarkdownDocumenterFeatureContext({
                    apiModel: this._apiModel,
                    outputFolder: outputFolder,
                    documenter: new MarkdownDocumenterAccessor({
                        getLinkForApiItem: (apiItem: ApiItem) => {
                            return this._getLinkFilenameForApiItem(apiItem);
                        }
                    })
                });
            });
        }

        console.log();
        this._deleteOldOutputFiles();

        this._writeApiItemPage(this._apiModel);

        if (this._pluginLoader.markdownDocumenterFeature) {
            this._pluginLoader.markdownDocumenterFeature.onFinished({});
        }
        this._writeIndex(this._apiModel);
    }

    private _writeApiItemPage(apiItem: ApiItem, output?: DocSection | DocParagraph): void {
        const configuration: TSDocConfiguration = this._tsdocConfiguration;
        if (!output) {
            output = new DocSection({ configuration: this._tsdocConfiguration });
        }

        if (output instanceof DocSection) {
            this._writeBreadcrumb(output, apiItem);
        }
        if (this._shouldHaveStandalonePage(apiItem)) {
            this._currentApiItemPage = apiItem;
        }

        const scopedName: string = apiItem.getScopedNameWithinPackage();

        switch (apiItem.kind) {
            case ApiItemKind.Class:
                //output.appendNode(new DocHeading({ configuration, title: `${scopedName} class` }));
                break;
            case ApiItemKind.Enum:
                output.appendNode(new DocHeading({ configuration, title: `${scopedName} enum`, id: this._htmlIDForItem(apiItem) }));
                break;
            case ApiItemKind.Interface:
                //output.appendNode(new DocHeading({ configuration, title: `${scopedName} interface` }));
                break;
            case ApiItemKind.Constructor:
            case ApiItemKind.ConstructSignature:
                output.appendNode(new DocHeading({ configuration, title: scopedName, level: 2, id: this._htmlIDForItem(apiItem) }));
                break;
            case ApiItemKind.Method:
            case ApiItemKind.MethodSignature:
                output.appendNode(new DocHeading({ configuration, title: apiItem.displayName, level: 2, id: this._htmlIDForItem(apiItem) }));
                break;
            case ApiItemKind.Function:
                output.appendNode(new DocHeading({ configuration, title: apiItem.displayName, level: 2, id: this._htmlIDForItem(apiItem) }));
                break;
            case ApiItemKind.Model:
                output.appendNode(new DocHeading({ configuration, title: `API Reference` }));
                break;
            case ApiItemKind.Namespace:
                output.appendNode(new DocHeading({ configuration, title: `${scopedName} namespace` }));
                break;
            case ApiItemKind.Package:
                console.log(`Writing ${apiItem.displayName} package`);
                // const unscopedPackageName: string = PackageName.getUnscopedName(apiItem.displayName);
                // output.appendNode(new DocHeading({ configuration, title: `${unscopedPackageName} package` }));
                break;
            case ApiItemKind.Property:
            case ApiItemKind.PropertySignature:
                output.appendNode(new DocHeading({ configuration, title: apiItem.displayName, level: 2, id: this._htmlIDForItem(apiItem) }));
                break;
            case ApiItemKind.TypeAlias:
                output.appendNode(new DocHeading({ configuration, title: apiItem.displayName, level: 2, id: this._htmlIDForItem(apiItem) }));
                break;
            case ApiItemKind.Variable:
                output.appendNode(new DocHeading({ configuration, title: apiItem.displayName, level: 2, id: this._htmlIDForItem(apiItem) }));
                break;
            default:
                throw new Error('Unsupported API item kind: ' + apiItem.kind);
        }

        if (ApiReleaseTagMixin.isBaseClassOf(apiItem)) {
            if (apiItem.releaseTag === ReleaseTag.Beta) {
                this._writeBetaWarning(output);
            }
        }

        if (apiItem instanceof ApiDocumentedItem) {
            const tsdocComment: DocComment | undefined = apiItem.tsdocComment;

            if (tsdocComment) {
                if (tsdocComment.deprecatedBlock) {
                    output.appendNode(
                        new DocNoteBox({ configuration: this._tsdocConfiguration }, [
                            new DocParagraph({ configuration: this._tsdocConfiguration }, [
                                new DocPlainText({
                                    configuration: this._tsdocConfiguration,
                                    text: 'Warning: This API is now obsolete. '
                                })
                            ]),
                            ...tsdocComment.deprecatedBlock.content.nodes
                        ])
                    );
                }

                this._appendSection(output, tsdocComment.summarySection);
            }
        }

        if (apiItem instanceof ApiDeclaredItem) {
            if (apiItem.excerpt.text.length > 0) {
                output.appendNode(
                    new DocParagraph({ configuration }, [
                        new DocEmphasisSpan({ configuration, bold: true }, [
                            new DocPlainText({ configuration, text: 'Signature:' })
                        ])
                    ])
                );
                output.appendNode(
                    new DocFencedCode({
                        configuration,
                        code: apiItem.getExcerptWithModifiers(),
                        language: 'typescript'
                    })
                );
            }

            this._writeHeritageTypes(output, apiItem);
        }

        let appendRemarks: boolean = true;
        switch (apiItem.kind) {
            case ApiItemKind.Class:
            case ApiItemKind.Interface:
            case ApiItemKind.Namespace:
            case ApiItemKind.Package:
                this._writeRemarksSection(output, apiItem);
                appendRemarks = false;
                break;
        }

        switch (apiItem.kind) {
            case ApiItemKind.Class:
                this._writeClassTables(output, apiItem as ApiClass);
                break;
            case ApiItemKind.Enum:
                this._writeEnumTables(output, apiItem as ApiEnum);
                break;
            case ApiItemKind.Interface:
                this._writeInterfaceTables(output, apiItem as ApiInterface);
                break;
            case ApiItemKind.Constructor:
            case ApiItemKind.ConstructSignature:
            case ApiItemKind.Method:
            case ApiItemKind.MethodSignature:
            case ApiItemKind.Function:
                this._writeParameterTables(output, apiItem as ApiParameterListMixin);
                this._writeThrowsSection(output, apiItem);
                break;
            case ApiItemKind.Namespace:
                this._writePackageOrNamespaceTables(output, apiItem as ApiNamespace);
                break;
            case ApiItemKind.Model:
                this._writeModelTable(output, apiItem as ApiModel);
                break;
            case ApiItemKind.Package:
                this._writePackageOrNamespaceTables(output, apiItem as ApiPackage);
                break;
            case ApiItemKind.Property:
            case ApiItemKind.PropertySignature:
                break;
            case ApiItemKind.TypeAlias:
                break;
            case ApiItemKind.Variable:
                break;
            default:
                throw new Error('Unsupported API item kind: ' + apiItem.kind);
        }

        if (appendRemarks) {
            this._writeRemarksSection(output, apiItem);
        }

        // we only generate top level package pages (which will generate class and interface subpages)
        const pkg: ApiPackage | undefined = apiItem.getAssociatedPackage();
        if (!pkg || !this._isAllowedPackage(pkg)) {
            console.log(`skipping ${apiItem.getScopedNameWithinPackage()}`);
            if (pkg) {
                console.log(`\t${pkg.name} package isn't in the allowed list`);
            }
            return;
        }

        // temp hack to reduce the size of the generated content
        if (!this._shouldHaveStandalonePage(apiItem)) {
            return;
        }

        const filename: string = path.join(this._outputFolder, this._getFilenameForApiItem(apiItem));
        const stringBuilder: StringBuilder = new StringBuilder();

        this._writeFrontMatter(stringBuilder, apiItem);

        this._markdownEmitter.emit(stringBuilder, output, {
            contextApiItem: apiItem,
            onGetFilenameForApiItem: (apiItemForFilename: ApiItem) => {
                return this._getLinkFilenameForApiItem(apiItemForFilename);
            }
        });

        let pageContent: string = stringBuilder.toString();

        if (this._pluginLoader.markdownDocumenterFeature) {
            // Allow the plugin to customize the pageContent
            const eventArgs: IMarkdownDocumenterFeatureOnBeforeWritePageArgs = {
                apiItem: apiItem,
                outputFilename: filename,
                pageContent: pageContent
            };
            this._pluginLoader.markdownDocumenterFeature.onBeforeWritePage(eventArgs);
            pageContent = eventArgs.pageContent;
        }

        FileSystem.writeFile(filename, pageContent, {
            convertLineEndings: this._documenterConfig ? this._documenterConfig.newlineKind : NewlineKind.CrLf,
            ensureFolderExists: true
        });
        console.log(filename, "saved to disk")
    }

    private _writeHeritageTypes(output: DocSection | DocParagraph, apiItem: ApiDeclaredItem): void {
        const configuration: TSDocConfiguration = this._tsdocConfiguration;

        if (apiItem instanceof ApiClass) {
            if (apiItem.extendsType) {
                const extendsParagraph: DocParagraph = new DocParagraph({ configuration }, [
                    new DocEmphasisSpan({ configuration, bold: true }, [
                        new DocPlainText({ configuration, text: 'Extends: ' })
                    ])
                ]);
                this._appendExcerptWithHyperlinks(extendsParagraph, apiItem.extendsType.excerpt);
                output.appendNode(extendsParagraph);
            }
            if (apiItem.implementsTypes.length > 0) {
                const extendsParagraph: DocParagraph = new DocParagraph({ configuration }, [
                    new DocEmphasisSpan({ configuration, bold: true }, [
                        new DocPlainText({ configuration, text: 'Implements: ' })
                    ])
                ]);
                let needsComma: boolean = false;
                for (const implementsType of apiItem.implementsTypes) {
                    if (needsComma) {
                        extendsParagraph.appendNode(new DocPlainText({ configuration, text: ', ' }));
                    }
                    this._appendExcerptWithHyperlinks(extendsParagraph, implementsType.excerpt);
                    needsComma = true;
                }
                output.appendNode(extendsParagraph);
            }
        }

        if (apiItem instanceof ApiInterface) {
            if (apiItem.extendsTypes.length > 0) {
                const extendsParagraph: DocParagraph = new DocParagraph({ configuration }, [
                    new DocEmphasisSpan({ configuration, bold: true }, [
                        new DocPlainText({ configuration, text: 'Extends: ' })
                    ])
                ]);
                let needsComma: boolean = false;
                for (const extendsType of apiItem.extendsTypes) {
                    if (needsComma) {
                        extendsParagraph.appendNode(new DocPlainText({ configuration, text: ', ' }));
                    }
                    this._appendExcerptWithHyperlinks(extendsParagraph, extendsType.excerpt);
                    needsComma = true;
                }
                output.appendNode(extendsParagraph);
            }
        }
    }

    private _writeRemarksSection(output: DocSection | DocParagraph, apiItem: ApiItem): void {
        if (apiItem instanceof ApiDocumentedItem) {
            const tsdocComment: DocComment | undefined = apiItem.tsdocComment;

            if (tsdocComment) {
                // Write the @remarks block
                if (tsdocComment.remarksBlock) {
                    output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Remarks' }));
                    this._appendSection(output, tsdocComment.remarksBlock.content);
                }

                // Write the @example blocks
                const exampleBlocks: DocBlock[] = tsdocComment.customBlocks.filter(
                    (x) => x.blockTag.tagNameWithUpperCase === StandardTags.example.tagNameWithUpperCase
                );

                let exampleNumber: number = 1;
                for (const exampleBlock of exampleBlocks) {
                    const heading: string = exampleBlocks.length > 1 ? `Example ${exampleNumber}` : 'Example';

                    output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: heading }));

                    this._appendSection(output, exampleBlock.content);

                    ++exampleNumber;
                }
            }
        }
    }

    private _writeThrowsSection(output: DocSection | DocParagraph, apiItem: ApiItem): void {
        if (apiItem instanceof ApiDocumentedItem) {
            const tsdocComment: DocComment | undefined = apiItem.tsdocComment;

            if (tsdocComment) {
                // Write the @throws blocks
                const throwsBlocks: DocBlock[] = tsdocComment.customBlocks.filter(
                    (x) => x.blockTag.tagNameWithUpperCase === StandardTags.throws.tagNameWithUpperCase
                );

                if (throwsBlocks.length > 0) {
                    const heading: string = 'Exceptions';
                    output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: heading }));

                    for (const throwsBlock of throwsBlocks) {
                        this._appendSection(output, throwsBlock.content);
                    }
                }
            }
        }
    }

    private _writeIndex(apiItem: ApiItem): void {
        // const indexPath: string = path.join(this._outputFolder, '_index.md');
        // const output: StringBuilder = new StringBuilder();
        // output.append(`---\nTitle: API Reference\n---\n\n`);
        // // TODO:
        // FileSystem.writeFile(indexPath, output.toString());
    }

    /**
     * GENERATE PAGE: MODEL
     */
    private _writeModelTable(output: DocSection | DocParagraph, apiModel: ApiModel): void {
        const configuration: TSDocConfiguration = this._tsdocConfiguration;

        const packagesTable: DocTable = new DocTable({
            configuration,
            headerTitles: ['Package', 'Description'],
            cssClass: 'package-list',
            caption: 'List of packages in this model'
        });

        for (const apiMember of apiModel.members) {
            const row: DocTableRow = new DocTableRow({ configuration }, [
                this._createTitleCell(apiMember),
                this._createDescriptionCell(apiMember)
            ]);

            switch (apiMember.kind) {
                case ApiItemKind.Package:
                    packagesTable.addRow(row);
                    this._writeApiItemPage(apiMember);
                    break;
            }
        }

        if (packagesTable.rows.length > 0) {
            output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Packages' }));
            output.appendNode(packagesTable);
        }
    }

    /**
     * GENERATE PAGE: PACKAGE or NAMESPACE
     */
    private _writePackageOrNamespaceTables(output: DocSection | DocParagraph, apiContainer: ApiPackage | ApiNamespace): void {
        const configuration: TSDocConfiguration = this._tsdocConfiguration;

        const classesTable: DocTable = new DocTable({
            configuration,
            headerTitles: ['Class', 'Description'],
            cssClass: 'class-list',
            caption: 'List of classes contained in this package or namespace'
        });

        const enumerationsTable: DocTable = new DocTable({
            configuration,
            headerTitles: ['Enumeration', 'Description'],
            cssClass: 'enum-list'
            ,
            caption: 'List of enums contained in this package or namespace'
        });

        const functionsTable: DocTable = new DocTable({
            configuration,
            headerTitles: ['Function', 'Description'],
            cssClass: 'function-list',
            caption: 'List of functions contained in this package or namespace'
        });

        const interfacesTable: DocTable = new DocTable({
            configuration,
            headerTitles: ['Interface', 'Description'],
            cssClass: 'interface-list',
            caption: 'List of interfaces contained in this package or namespace'
        });

        const namespacesTable: DocTable = new DocTable({
            configuration,
            headerTitles: ['Namespace', 'Description'],
            cssClass: 'namespace-list',
            caption: 'List of namespaces contained in this package or namespace'
        });

        const variablesTable: DocTable = new DocTable({
            configuration,
            headerTitles: ['Variable', 'Description'],
            cssClass: 'variable-list',
            caption: 'List of variables contained in this package or namespace'
        });

        const typeAliasesTable: DocTable = new DocTable({
            configuration,
            headerTitles: ['Type Alias', 'Description'],
            cssClass: 'alias-list',
            caption: 'List of type aliases contained in this package or namespace'
        });

        const enumsParagraph: DocParagraph = new DocParagraph({ configuration });
        const varsParagraph: DocParagraph = new DocParagraph({ configuration });
        const functionsParagraph: DocParagraph = new DocParagraph({ configuration });
        const aliasesParagraph: DocParagraph = new DocParagraph({ configuration });

        const apiMembers: ReadonlyArray<ApiItem> =
            apiContainer.kind === ApiItemKind.Package
                ? (apiContainer as ApiPackage).entryPoints[0].members
                : (apiContainer as ApiNamespace).members;

        // loop through the members of the package/namespace.
        for (const apiMember of apiMembers) {
            const row: DocTableRow = new DocTableRow({ configuration }, [
                this._createTitleCell(apiMember),
                this._createDescriptionCell(apiMember)
            ]);

            switch (apiMember.kind) {
                case ApiItemKind.Class:
                    classesTable.addRow(row);
                    this._writeApiItemPage(apiMember);
                    break;

                case ApiItemKind.Enum:
                    enumerationsTable.addRow(row);
                    this._writeApiItemPage(apiMember, enumsParagraph);
                    break;

                case ApiItemKind.Interface:
                    interfacesTable.addRow(row);
                    this._writeApiItemPage(apiMember);
                    break;

                case ApiItemKind.Namespace:
                    namespacesTable.addRow(row);
                    this._writeApiItemPage(apiMember, output);
                    break;

                case ApiItemKind.Function:
                    functionsTable.addRow(row);
                    this._writeApiItemPage(apiMember, functionsParagraph);
                    break;

                case ApiItemKind.TypeAlias:
                    typeAliasesTable.addRow(row);
                    this._writeApiItemPage(apiMember, aliasesParagraph);
                    break;

                case ApiItemKind.Variable:
                    variablesTable.addRow(row);
                    this._writeApiItemPage(apiMember, varsParagraph);
                    break;
            }
        }

        if (classesTable.rows.length > 0) {
            output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Classes' }));
            output.appendNode(classesTable);
        }

        if (enumerationsTable.rows.length > 0) {
            output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Enumerations' }));
            output.appendNode(enumerationsTable);
        }
        if (functionsTable.rows.length > 0) {
            output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Functions' }));
            output.appendNode(functionsTable);
        }

        if (interfacesTable.rows.length > 0) {
            output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Interfaces' }));
            output.appendNode(interfacesTable);
        }

        if (namespacesTable.rows.length > 0) {
            output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Namespaces' }));
            output.appendNode(namespacesTable);
        }

        if (variablesTable.rows.length > 0) {
            output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Variables' }));
            output.appendNode(variablesTable);
        }

        if (typeAliasesTable.rows.length > 0) {
            output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Type Aliases' }));
            output.appendNode(typeAliasesTable);
        }

        const details: DocSection = new DocSection({ configuration }, [
            new DocHtmlStartTag({ configuration: this._tsdocConfiguration, name: "hr" }),
            new DocHtmlStartTag({
                configuration: this._tsdocConfiguration, name: "div", htmlAttributes: [
                    new DocHtmlAttribute({ configuration: this._tsdocConfiguration, name: "id", value: "package-details" })]
            })
        ]);


        if (enumsParagraph.nodes.length > 0) {
            details.appendNode(new DocHeading({ configuration, title: 'Enumerations' }));
            details.appendNode(enumsParagraph);
        }

        if (functionsParagraph.nodes.length > 0) {
            details.appendNode(new DocHeading({ configuration, title: 'Functions' }));
            details.appendNode(functionsParagraph);
        }

        if (varsParagraph.nodes.length > 0) {
            details.appendNode(new DocHeading({ configuration, title: 'Variables' }));
            details.appendNode(varsParagraph);
        }

        if (aliasesParagraph.nodes.length > 0) {
            details.appendNode(new DocHeading({ configuration, title: 'Type Aliases' }));
            details.appendNode(aliasesParagraph);
        }

        details.appendNode(new DocHtmlEndTag({
            configuration, name: "div"
        }));

        output.appendNode(details)

    }

    /**
     * GENERATE PAGE: CLASS
     */
    private _writeClassTables(output: DocSection | DocParagraph, apiClass: ApiClass): void {
        const configuration: TSDocConfiguration = this._tsdocConfiguration;

        const eventsTable: DocTable = new DocTable({
            configuration,
            headerTitles: ['Property', 'Modifiers', 'Type', 'Description'],
            cssClass: 'event-list',
            caption: 'List of events in use in this class'
        });

        const constructorsTable: DocTable = new DocTable({
            configuration,
            headerTitles: ['Constructor', 'Modifiers', 'Description'],
            cssClass: 'constructor-list',
            caption: 'List of constructors for this class'
        });

        const propertiesTable: DocTable = new DocTable({
            configuration,
            headerTitles: ['Property', 'Modifiers', 'Type', 'Description'],
            cssClass: 'property-list',
            caption: 'List of properties for this class'
        });

        const methodsTable: DocTable = new DocTable({
            configuration,
            headerTitles: ['Method', 'Modifiers', 'Description'],
            cssClass: 'method-list',
            caption: 'List of methods on this class'
        });


        const constructorsParagraph: DocParagraph = new DocParagraph({ configuration });
        const methodsParagraph: DocParagraph = new DocParagraph({ configuration });
        const propertiesParagraph: DocParagraph = new DocParagraph({ configuration });
        const eventsParagraph: DocParagraph = new DocParagraph({ configuration });

        for (const apiMember of apiClass.members) {
            switch (apiMember.kind) {
                case ApiItemKind.Constructor: {
                    constructorsTable.addRow(
                        new DocTableRow({ configuration }, [
                            this._createTitleCell(apiMember),
                            this._createModifiersCell(apiMember),
                            this._createDescriptionCell(apiMember)
                        ])
                    );

                    this._writeApiItemPage(apiMember, constructorsParagraph);
                    break;
                }
                case ApiItemKind.Method: {
                    methodsTable.addRow(
                        new DocTableRow({ configuration }, [
                            this._createTitleCell(apiMember),
                            this._createModifiersCell(apiMember),
                            this._createDescriptionCell(apiMember)
                        ])
                    );

                    this._writeApiItemPage(apiMember, methodsParagraph);
                    break;
                }
                case ApiItemKind.Property: {
                    if ((apiMember as ApiPropertyItem).isEventProperty) {
                        eventsTable.addRow(
                            new DocTableRow({ configuration }, [
                                this._createTitleCell(apiMember),
                                this._createModifiersCell(apiMember),
                                this._createPropertyTypeCell(apiMember),
                                this._createDescriptionCell(apiMember)
                            ])
                        );
                        this._writeApiItemPage(apiMember, eventsParagraph);
                    } else {
                        propertiesTable.addRow(
                            new DocTableRow({ configuration }, [
                                this._createTitleCell(apiMember),
                                this._createModifiersCell(apiMember),
                                this._createPropertyTypeCell(apiMember),
                                this._createDescriptionCell(apiMember)
                            ])
                        );
                        this._writeApiItemPage(apiMember, propertiesParagraph);
                    }


                    break;
                }
            }
        }

        if (eventsTable.rows.length > 0) {
            output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Events' }));
            output.appendNode(eventsTable);
        }

        if (constructorsTable.rows.length > 0) {
            output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Constructors' }));
            output.appendNode(constructorsTable);
        }

        if (propertiesTable.rows.length > 0) {
            output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Properties' }));
            output.appendNode(propertiesTable);
        }

        if (methodsTable.rows.length > 0) {
            output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Methods' }));
            output.appendNode(methodsTable);
        }

        const details: DocSection = new DocSection({ configuration: this._tsdocConfiguration }, [
            new DocHtmlStartTag({ configuration: this._tsdocConfiguration, name: "hr" }),
            new DocHtmlStartTag({
                configuration: this._tsdocConfiguration, name: "div", htmlAttributes: [
                    new DocHtmlAttribute({ configuration: this._tsdocConfiguration, name: "id", value: "class-details" })]
            })
        ]);

        if (eventsParagraph.nodes.length > 0) {
            details.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Events' }));
            details.appendNode(eventsParagraph);
        }

        if (constructorsParagraph.nodes.length > 0) {
            details.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Constructors' }));
            details.appendNode(constructorsParagraph);
        }

        if (propertiesParagraph.nodes.length > 0) {
            details.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Properties' }));
            details.appendNode(propertiesParagraph);
        }

        if (methodsParagraph.nodes.length > 0) {
            details.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Methods' }));
            details.appendNode(methodsParagraph);
        }

        details.appendNode(new DocHtmlEndTag({
            configuration: this._tsdocConfiguration, name: "div"
        }));

        output.appendNode(details);

    }

    /**
     * GENERATE PAGE: ENUM
     */
    private _writeEnumTables(output: DocSection | DocParagraph, apiEnum: ApiEnum): void {
        const configuration: TSDocConfiguration = this._tsdocConfiguration;

        const enumMembersTable: DocTable = new DocTable({
            configuration,
            headerTitles: ['Member', 'Value', 'Description'],
            cssClass: 'enum-list',
            caption: 'List of members in use in this enum'
        });

        for (const apiEnumMember of apiEnum.members) {
            enumMembersTable.addRow(
                new DocTableRow({ configuration }, [
                    new DocTableCell({ configuration }, [
                        new DocParagraph({ configuration }, [
                            new DocPlainText({ configuration, text: Utilities.getConciseSignature(apiEnumMember) })
                        ])
                    ]),

                    new DocTableCell({ configuration }, [
                        new DocParagraph({ configuration }, [
                            new DocCodeSpan({ configuration, code: apiEnumMember.initializerExcerpt.text })
                        ])
                    ]),

                    this._createDescriptionCell(apiEnumMember)
                ])
            );
        }

        if (enumMembersTable.rows.length > 0) {
            output.appendNode(
                new DocHeading({ configuration: this._tsdocConfiguration, title: 'Enumeration Members' })
            );
            output.appendNode(enumMembersTable);
        }
    }

    /**
     * GENERATE PAGE: INTERFACE
     */
    private _writeInterfaceTables(output: DocSection | DocParagraph, apiClass: ApiInterface): void {
        const configuration: TSDocConfiguration = this._tsdocConfiguration;

        const eventsTable: DocTable = new DocTable({
            configuration,
            headerTitles: ['Property', 'Type', 'Description'],
            cssClass: 'event-list',
            caption: 'List of events in use in this interface'
        });

        const propertiesTable: DocTable = new DocTable({
            configuration,
            headerTitles: ['Property', 'Type', 'Description'],
            cssClass: 'property-list',
            caption: 'List of properties of this interface'
        });

        const methodsTable: DocTable = new DocTable({
            configuration,
            headerTitles: ['Method', 'Description'],
            cssClass: 'method-list',
            caption: 'List of methods of this class'
        });

        const eventsParagraph: DocParagraph = new DocParagraph({ configuration });
        const propertiesParagraph: DocParagraph = new DocParagraph({ configuration });
        const methodsParagraph: DocParagraph = new DocParagraph({ configuration });

        for (const apiMember of apiClass.members) {
            switch (apiMember.kind) {
                case ApiItemKind.ConstructSignature:
                case ApiItemKind.MethodSignature: {
                    methodsTable.addRow(
                        new DocTableRow({ configuration }, [
                            this._createTitleCell(apiMember),
                            this._createDescriptionCell(apiMember)
                        ])
                    );

                    this._writeApiItemPage(apiMember, methodsParagraph);
                    break;
                }
                case ApiItemKind.PropertySignature: {
                    if ((apiMember as ApiPropertyItem).isEventProperty) {
                        eventsTable.addRow(
                            new DocTableRow({ configuration }, [
                                this._createTitleCell(apiMember),
                                this._createPropertyTypeCell(apiMember),
                                this._createDescriptionCell(apiMember)
                            ])
                        );
                        this._writeApiItemPage(apiMember, propertiesParagraph);
                    } else {
                        propertiesTable.addRow(
                            new DocTableRow({ configuration }, [
                                this._createTitleCell(apiMember),
                                this._createPropertyTypeCell(apiMember),
                                this._createDescriptionCell(apiMember)
                            ])
                        );
                        this._writeApiItemPage(apiMember, eventsParagraph);
                    }


                    break;
                }
            }
        }

        if (eventsTable.rows.length > 0) {
            output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Events' }));
            output.appendNode(eventsTable);
        }

        if (propertiesTable.rows.length > 0) {
            output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Properties' }));
            output.appendNode(propertiesTable);
        }

        if (methodsTable.rows.length > 0) {
            output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Methods' }));
            output.appendNode(methodsTable);
        }

        const details: DocSection = new DocSection({ configuration: this._tsdocConfiguration }, [
            new DocHtmlStartTag({ configuration: this._tsdocConfiguration, name: "hr" }),
            new DocHtmlStartTag({
                configuration: this._tsdocConfiguration, name: "div", htmlAttributes: [
                    new DocHtmlAttribute({ configuration: this._tsdocConfiguration, name: "id", value: "interface-details" })]
            })
        ]);

        if (eventsParagraph.nodes.length > 0) {
            details.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Events' }));
            details.appendNode(eventsParagraph);
        }

        if (propertiesParagraph.nodes.length > 0) {
            details.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Properties' }));
            details.appendNode(propertiesParagraph);
        }

        if (methodsParagraph.nodes.length > 0) {
            details.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Methods' }));
            details.appendNode(methodsParagraph);
        }

        details.appendNode(new DocHtmlEndTag({
            configuration: this._tsdocConfiguration, name: "div"
        }));

        output.appendNode(details);
    }

    /**
     * GENERATE PAGE: FUNCTION-LIKE
     */
    private _writeParameterTables(output: DocSection | DocParagraph, apiParameterListMixin: ApiParameterListMixin): void {
        const configuration: TSDocConfiguration = this._tsdocConfiguration;

        const parametersTable: DocTable = new DocTable({
            configuration,
            headerTitles: ['Parameter', 'Type', 'Description'],
            cssClass: 'param-list'
            ,
            caption: 'List of parameters'
        });
        for (const apiParameter of apiParameterListMixin.parameters) {
            const parameterDescription: DocSection = new DocSection({ configuration });
            if (apiParameter.tsdocParamBlock) {
                this._appendSection(parameterDescription, apiParameter.tsdocParamBlock.content);
            }

            parametersTable.addRow(
                new DocTableRow({ configuration }, [
                    new DocTableCell({ configuration }, [
                        new DocParagraph({ configuration }, [
                            new DocPlainText({ configuration, text: apiParameter.name })
                        ])
                    ]),
                    new DocTableCell({ configuration }, [
                        this._createParagraphForTypeExcerpt(apiParameter.parameterTypeExcerpt)
                    ]),
                    new DocTableCell({ configuration }, parameterDescription.nodes)
                ])
            );
        }

        if (parametersTable.rows.length > 0) {
            output.appendNode(new DocHeading({ configuration: this._tsdocConfiguration, title: 'Parameters', level: 4 }));
            output.appendNode(parametersTable);
        }

        if (ApiReturnTypeMixin.isBaseClassOf(apiParameterListMixin)) {
            const returnTypeExcerpt: Excerpt = apiParameterListMixin.returnTypeExcerpt;
            output.appendNode(
                new DocParagraph({ configuration }, [
                    new DocEmphasisSpan({ configuration, bold: true }, [
                        new DocPlainText({ configuration, text: 'Returns:' })
                    ])
                ])
            );

            output.appendNode(this._createParagraphForTypeExcerpt(returnTypeExcerpt));

            if (apiParameterListMixin instanceof ApiDocumentedItem) {
                if (apiParameterListMixin.tsdocComment && apiParameterListMixin.tsdocComment.returnsBlock) {
                    this._appendSection(output, apiParameterListMixin.tsdocComment.returnsBlock.content);
                }
            }
        }
    }

    private _createParagraphForTypeExcerpt(excerpt: Excerpt): DocParagraph {
        const configuration: TSDocConfiguration = this._tsdocConfiguration;

        const paragraph: DocParagraph = new DocParagraph({ configuration });

        if (!excerpt.text.trim()) {
            paragraph.appendNode(new DocPlainText({ configuration, text: '(not declared)' }));
        } else {
            this._appendExcerptWithHyperlinks(paragraph, excerpt);
        }

        return paragraph;
    }

    private _appendExcerptWithHyperlinks(docNodeContainer: DocNodeContainer, excerpt: Excerpt): void {
        const configuration: TSDocConfiguration = this._tsdocConfiguration;

        for (const token of excerpt.spannedTokens) {
            // Markdown doesn't provide a standardized syntax for hyperlinks inside code spans, so we will render
            // the type expression as DocPlainText.  Instead of creating multiple DocParagraphs, we can simply
            // discard any newlines and let the renderer do normal word-wrapping.
            const unwrappedTokenText: string = token.text.replace(/[\r\n]+/g, ' ');

            // If it's hyperlinkable, then append a DocLinkTag
            if (token.kind === ExcerptTokenKind.Reference && token.canonicalReference) {
                const apiItemResult: IResolveDeclarationReferenceResult = this._apiModel.resolveDeclarationReference(
                    token.canonicalReference,
                    undefined
                );

                if (apiItemResult.resolvedApiItem) {
                    docNodeContainer.appendNode(
                        new DocLinkTag({
                            configuration,
                            tagName: '@link',
                            linkText: unwrappedTokenText,
                            urlDestination: this._getLinkFilenameForApiItem(apiItemResult.resolvedApiItem)
                        })
                    );
                    continue;
                }
            }

            // Otherwise append non-hyperlinked text
            docNodeContainer.appendNode(new DocPlainText({ configuration, text: unwrappedTokenText }));
        }
    }

    private _createTitleCell(apiItem: ApiItem): DocTableCell {
        const configuration: TSDocConfiguration = this._tsdocConfiguration;

        return new DocTableCell({ configuration }, [
            new DocParagraph({ configuration }, [
                new DocLinkTag({
                    configuration,
                    tagName: '@link',
                    linkText: Utilities.getConciseSignature(apiItem),
                    urlDestination: this._getLinkFilenameForApiItem(apiItem)
                })
            ])
        ]);
    }

    /**
     * This generates a DocTableCell for an ApiItem including the summary section and "(BETA)" annotation.
     *
     * @remarks
     * We mostly assume that the input is an ApiDocumentedItem, but it's easier to perform this as a runtime
     * check than to have each caller perform a type cast.
     */
    private _createDescriptionCell(apiItem: ApiItem): DocTableCell {
        const configuration: TSDocConfiguration = this._tsdocConfiguration;

        const section: DocSection = new DocSection({ configuration });

        if (ApiReleaseTagMixin.isBaseClassOf(apiItem)) {
            if (apiItem.releaseTag === ReleaseTag.Beta) {
                section.appendNodesInParagraph([
                    new DocEmphasisSpan({ configuration, bold: true, italic: true }, [
                        new DocPlainText({ configuration, text: '(BETA)' })
                    ]),
                    new DocPlainText({ configuration, text: ' ' })
                ]);
            }
        }

        if (apiItem instanceof ApiDocumentedItem) {
            if (apiItem.tsdocComment !== undefined) {
                this._appendAndMergeSection(section, apiItem.tsdocComment.summarySection);
            }
        }

        return new DocTableCell({ configuration }, section.nodes);
    }

    private _createModifiersCell(apiItem: ApiItem): DocTableCell {
        const configuration: TSDocConfiguration = this._tsdocConfiguration;

        const section: DocSection = new DocSection({ configuration });

        if (ApiStaticMixin.isBaseClassOf(apiItem)) {
            if (apiItem.isStatic) {
                section.appendNodeInParagraph(new DocCodeSpan({ configuration, code: 'static' }));
            }
        }

        return new DocTableCell({ configuration }, section.nodes);
    }

    private _createPropertyTypeCell(apiItem: ApiItem): DocTableCell {
        const configuration: TSDocConfiguration = this._tsdocConfiguration;

        const section: DocSection = new DocSection({ configuration });

        if (apiItem instanceof ApiPropertyItem) {
            section.appendNode(this._createParagraphForTypeExcerpt(apiItem.propertyTypeExcerpt));
        }

        return new DocTableCell({ configuration }, section.nodes);
    }

    // prepare the markdown frontmatter by providing the metadata needed to nicely render the page.
    private _writeFrontMatter(stringBuilder: StringBuilder, item: ApiItem): void {

        this._frontMatter.kind = item.kind;
        this._frontMatter.title = item.displayName.replace(/"/g, '').replace(/!/g, '');
        let apiMembers: ReadonlyArray<ApiItem> = item.members;
        switch (item.kind) {
            case ApiItemKind.Class:
                const classItem: ApiClass = item as ApiClass;
                if (classItem.tsdocComment) {
                    const tmpStrBuilder: StringBuilder = new StringBuilder();
                    const summary: DocSection = classItem.tsdocComment!.summarySection;
                    this._markdownEmitter.emit(tmpStrBuilder, summary, {
                        contextApiItem: item,
                        onGetFilenameForApiItem: (apiItemForFilename: ApiItem) => {
                            return this._getLinkFilenameForApiItem(apiItemForFilename);
                        }
                    });
                    this._frontMatter.summary = tmpStrBuilder.toString().replace(/"/g, "'").trim();
                }
                this._frontMatter.title += " Class"
                break;
            case ApiItemKind.Interface:
                this._frontMatter.title += " Interface"
                break
            case ApiItemKind.Package:
                this._frontMatter.title += " Package"
                apiMembers =
                    item.kind === ApiItemKind.Package
                        ? (item as ApiPackage).entryPoints[0].members
                        : (item as ApiNamespace).members;
                break
            default:
                break;
        }

        this._frontMatter.members = new Map<string, string[]>();

        apiMembers.forEach(element => {
            if (element.displayName === "") { return }
            if (!this._frontMatter.members[element.kind]) { this._frontMatter.members[element.kind] = [] }
            this._frontMatter.members[element.kind].push(element.displayName);
        });

        const pkg: ApiPackage | undefined = item.getAssociatedPackage();
        if (pkg) {
            this._frontMatter.package = pkg.name.replace(/"/g, '').replace(/!/g, '');
        } else {
            this._frontMatter.package = "undefined";
        }
        // this._frontMatter.members = this._frontMatter.members;


        stringBuilder.append(JSON.stringify(this._frontMatter));
        stringBuilder.append(
            '\n\n[//]: # (Do not edit this file. It is automatically generated by API Documenter.)\n\n'
        );

    }

    private _writeBreadcrumb(output: DocSection, apiItem: ApiItem): void {
        // no breadcrumbs for inner content
        if ((apiItem.kind !== ApiItemKind.Package) && (apiItem.kind !== ApiItemKind.Class) && (apiItem.kind !== ApiItemKind.Interface)) {
            return;
        }

        output.appendNodeInParagraph(
            new DocLinkTag({
                configuration: this._tsdocConfiguration,
                tagName: '@link',
                linkText: 'Packages',
                urlDestination: this._getLinkFilenameForApiItem(this._apiModel)
            })
        );

        for (const hierarchyItem of apiItem.getHierarchy()) {
            switch (hierarchyItem.kind) {
                case ApiItemKind.Model:
                case ApiItemKind.EntryPoint:
                    // We don't show the model as part of the breadcrumb because it is the root-level container.
                    // We don't show the entry point because today API Extractor doesn't support multiple entry points;
                    // this may change in the future.
                    break;
                default:
                    output.appendNodesInParagraph([
                        new DocPlainText({
                            configuration: this._tsdocConfiguration,
                            text: ' > '
                        }),
                        new DocLinkTag({
                            configuration: this._tsdocConfiguration,
                            tagName: '@link',
                            linkText: hierarchyItem.displayName,
                            urlDestination: this._getLinkFilenameForApiItem(hierarchyItem)
                        })
                    ]);
            }
        }
    }

    private _writeBetaWarning(output: DocSection | DocParagraph): void {
        const configuration: TSDocConfiguration = this._tsdocConfiguration;
        const betaWarning: string =
            'This API is provided as a preview for developers and may change' +
            ' based on feedback that we receive.  Do not use this API in a production environment.';
        output.appendNode(
            new DocNoteBox({ configuration }, [
                new DocParagraph({ configuration }, [new DocPlainText({ configuration, text: betaWarning })])
            ])
        );
    }

    private _appendSection(output: DocSection | DocParagraph, docSection: DocSection): void {
        for (const node of docSection.nodes) {
            output.appendNode(node);
        }
    }

    private _appendAndMergeSection(output: DocSection, docSection: DocSection): void {
        let firstNode: boolean = true;
        for (const node of docSection.nodes) {
            if (firstNode) {
                if (node.kind === DocNodeKind.Paragraph) {
                    output.appendNodesInParagraph(node.getChildNodes());
                    firstNode = false;
                    continue;
                }
            }
            firstNode = false;

            output.appendNode(node);
        }
    }

    private _getFilenameForApiItem(apiItem: ApiItem): string {
        if (apiItem.kind === ApiItemKind.Model) {
            return '/';
        }

        let baseName: string = '';
        for (const hierarchyItem of apiItem.getHierarchy()) {
            // For overloaded methods, add a suffix such as "MyClass.myMethod_2".
            let qualifiedName: string = Utilities.getSafeFilenameForName(hierarchyItem.displayName);
            if (ApiParameterListMixin.isBaseClassOf(hierarchyItem)) {
                if (hierarchyItem.overloadIndex > 1) {
                    // Subtract one for compatibility with earlier releases of API Documenter.
                    // (This will get revamped when we fix GitHub issue #1308)
                    qualifiedName += `_${hierarchyItem.overloadIndex - 1}`;
                }
            }

            switch (hierarchyItem.kind) {
                case ApiItemKind.Model:
                case ApiItemKind.EntryPoint:
                    break;
                case ApiItemKind.Package:
                    baseName = Utilities.getSafeFilenameForName(PackageName.getUnscopedName(hierarchyItem.displayName));
                    break;
                default:
                    baseName += '/' + qualifiedName;
            }
        }

        switch (apiItem.kind) {
            case ApiItemKind.Method:
            case ApiItemKind.Property:
            case ApiItemKind.Function:
            case ApiItemKind.Variable:
                return '#' + baseName;
                break;
            default:
                return baseName + '.md';
        }

    }

    private _htmlIDForItem(apiItem: ApiItem): string {
        if (apiItem.kind === ApiItemKind.Model) {
            return '';
        }

        let baseName: string = '';
        for (const hierarchyItem of apiItem.getHierarchy()) {
            let qualifiedName: string = Utilities.getSafeFilenameForName(hierarchyItem.displayName);
            if (ApiParameterListMixin.isBaseClassOf(hierarchyItem)) {
                if (hierarchyItem.overloadIndex > 1) {
                    qualifiedName += `_${hierarchyItem.overloadIndex - 1}`;
                }
            }

            switch (hierarchyItem.kind) {
                case ApiItemKind.Model:
                case ApiItemKind.EntryPoint:
                    break;
                case ApiItemKind.Package:
                    baseName = Utilities.getSafeFilenameForName(PackageName.getUnscopedName(hierarchyItem.displayName));
                    break;
                default:
                    baseName += '-' + qualifiedName;
            }
        }
        return baseName + '-' + apiItem.kind;
    }

    private _getHrefForApiItem(apiItem: ApiItem): string {
        if (this._currentApiItemPage !== apiItem.parent) {
            // we need to build the href linking to the parent's page, not the current's page.
            return this._uriRoot + this._getFilenameForApiItem(apiItem.parent!).replace(/\.md/g, "/") + '#' + this._htmlIDForItem(apiItem);
        }
        return '#' + this._htmlIDForItem(apiItem);
    }

    private _getLinkFilenameForApiItem(apiItem: ApiItem): string {
        if (apiItem.kind === ApiItemKind.Model) {
            return this._uriRoot;
        }
        if (this._shouldHaveStandalonePage(apiItem)) {
            return this._uriRoot + this._getFilenameForApiItem(apiItem);
        } else {
            return this._getHrefForApiItem(apiItem);
        }
    }

    private _deleteOldOutputFiles(): void {
        console.log('Deleting old output from ' + this._outputFolder);
        FileSystem.ensureEmptyFolder(this._outputFolder);
    }

    private _shouldHaveStandalonePage(apiItem: ApiItem): boolean {
        return (apiItem.kind === ApiItemKind.Package) || (apiItem.kind === ApiItemKind.Class) || (apiItem.kind === ApiItemKind.Interface)
    }

    private _isAllowedPackage(pkg: ApiPackage): boolean {
        if (this._documenterConfig && this._documenterConfig!.onlyPackagesStartingWith) {
            return pkg.name.startsWith(this._documenterConfig!.onlyPackagesStartingWith)
        }
        return true;
    }
}

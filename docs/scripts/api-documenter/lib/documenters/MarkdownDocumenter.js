"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const node_core_library_1 = require("@rushstack/node-core-library");
const tsdoc_1 = require("@microsoft/tsdoc");
const api_extractor_model_1 = require("@microsoft/api-extractor-model");
const CustomDocNodeKind_1 = require("../nodes/CustomDocNodeKind");
const DocHeading_1 = require("../nodes/DocHeading");
const DocTable_1 = require("../nodes/DocTable");
const DocEmphasisSpan_1 = require("../nodes/DocEmphasisSpan");
const DocTableRow_1 = require("../nodes/DocTableRow");
const DocTableCell_1 = require("../nodes/DocTableCell");
const DocNoteBox_1 = require("../nodes/DocNoteBox");
const Utilities_1 = require("../utils/Utilities");
const CustomMarkdownEmitter_1 = require("../markdown/CustomMarkdownEmitter");
const PluginLoader_1 = require("../plugin/PluginLoader");
const MarkdownDocumenterFeature_1 = require("../plugin/MarkdownDocumenterFeature");
const MarkdownDocumenterAccessor_1 = require("../plugin/MarkdownDocumenterAccessor");
const FrontMatter_1 = require("./FrontMatter");
//import { getHeapStatistics } from 'v8';
/**
 * Renders API documentation in the Markdown file format.
 * For more info:  https://en.wikipedia.org/wiki/Markdown
 */
class MarkdownDocumenter {
    constructor(apiModel, documenterConfig) {
        this._apiModel = apiModel;
        this._documenterConfig = documenterConfig;
        this._tsdocConfiguration = CustomDocNodeKind_1.CustomDocNodes.configuration;
        this._markdownEmitter = new CustomMarkdownEmitter_1.CustomMarkdownEmitter(this._apiModel);
        this._frontMatter = new FrontMatter_1.FrontMatter();
        this._pluginLoader = new PluginLoader_1.PluginLoader();
    }
    generateFiles(outputFolder) {
        this._outputFolder = outputFolder;
        if (this._documenterConfig) {
            this._pluginLoader.load(this._documenterConfig, () => {
                return new MarkdownDocumenterFeature_1.MarkdownDocumenterFeatureContext({
                    apiModel: this._apiModel,
                    outputFolder: outputFolder,
                    documenter: new MarkdownDocumenterAccessor_1.MarkdownDocumenterAccessor({
                        getLinkForApiItem: (apiItem) => {
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
    _writeApiItemPage(apiItem) {
        const configuration = this._tsdocConfiguration;
        const output = new tsdoc_1.DocSection({ configuration: this._tsdocConfiguration });
        this._writeBreadcrumb(output, apiItem);
        const scopedName = apiItem.getScopedNameWithinPackage();
        switch (apiItem.kind) {
            case "Class" /* Class */:
                output.appendNode(new DocHeading_1.DocHeading({ configuration, title: `${scopedName} class` }));
                break;
            case "Enum" /* Enum */:
                output.appendNode(new DocHeading_1.DocHeading({ configuration, title: `${scopedName} enum` }));
                break;
            case "Interface" /* Interface */:
                output.appendNode(new DocHeading_1.DocHeading({ configuration, title: `${scopedName} interface` }));
                break;
            case "Constructor" /* Constructor */:
            case "ConstructSignature" /* ConstructSignature */:
                output.appendNode(new DocHeading_1.DocHeading({ configuration, title: scopedName }));
                break;
            case "Method" /* Method */:
            case "MethodSignature" /* MethodSignature */:
                output.appendNode(new DocHeading_1.DocHeading({ configuration, title: `${scopedName} method` }));
                break;
            case "Function" /* Function */:
                output.appendNode(new DocHeading_1.DocHeading({ configuration, title: `${scopedName} function` }));
                break;
            case "Model" /* Model */:
                output.appendNode(new DocHeading_1.DocHeading({ configuration, title: `API Reference` }));
                break;
            case "Namespace" /* Namespace */:
                output.appendNode(new DocHeading_1.DocHeading({ configuration, title: `${scopedName} namespace` }));
                break;
            case "Package" /* Package */:
                console.log(`Writing ${apiItem.displayName} package`);
                const unscopedPackageName = node_core_library_1.PackageName.getUnscopedName(apiItem.displayName);
                output.appendNode(new DocHeading_1.DocHeading({ configuration, title: `${unscopedPackageName} package` }));
                break;
            case "Property" /* Property */:
            case "PropertySignature" /* PropertySignature */:
                output.appendNode(new DocHeading_1.DocHeading({ configuration, title: `${scopedName} property` }));
                break;
            case "TypeAlias" /* TypeAlias */:
                output.appendNode(new DocHeading_1.DocHeading({ configuration, title: `${scopedName} type` }));
                break;
            case "Variable" /* Variable */:
                output.appendNode(new DocHeading_1.DocHeading({ configuration, title: `${scopedName} variable` }));
                break;
            default:
                throw new Error('Unsupported API item kind: ' + apiItem.kind);
        }
        if (api_extractor_model_1.ApiReleaseTagMixin.isBaseClassOf(apiItem)) {
            if (apiItem.releaseTag === api_extractor_model_1.ReleaseTag.Beta) {
                this._writeBetaWarning(output);
            }
        }
        if (apiItem instanceof api_extractor_model_1.ApiDocumentedItem) {
            const tsdocComment = apiItem.tsdocComment;
            if (tsdocComment) {
                if (tsdocComment.deprecatedBlock) {
                    output.appendNode(new DocNoteBox_1.DocNoteBox({ configuration: this._tsdocConfiguration }, [
                        new tsdoc_1.DocParagraph({ configuration: this._tsdocConfiguration }, [
                            new tsdoc_1.DocPlainText({
                                configuration: this._tsdocConfiguration,
                                text: 'Warning: This API is now obsolete. '
                            })
                        ]),
                        ...tsdocComment.deprecatedBlock.content.nodes
                    ]));
                }
                this._appendSection(output, tsdocComment.summarySection);
            }
        }
        if (apiItem instanceof api_extractor_model_1.ApiDeclaredItem) {
            if (apiItem.excerpt.text.length > 0) {
                output.appendNode(new tsdoc_1.DocParagraph({ configuration }, [
                    new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true }, [
                        new tsdoc_1.DocPlainText({ configuration, text: 'Signature:' })
                    ])
                ]));
                output.appendNode(new tsdoc_1.DocFencedCode({
                    configuration,
                    code: apiItem.getExcerptWithModifiers(),
                    language: 'typescript'
                }));
            }
            this._writeHeritageTypes(output, apiItem);
        }
        let appendRemarks = true;
        switch (apiItem.kind) {
            case "Class" /* Class */:
            case "Interface" /* Interface */:
            case "Namespace" /* Namespace */:
            case "Package" /* Package */:
                this._writeRemarksSection(output, apiItem);
                appendRemarks = false;
                break;
        }
        switch (apiItem.kind) {
            case "Class" /* Class */:
                this._writeClassTables(output, apiItem);
                break;
            case "Enum" /* Enum */:
                this._writeEnumTables(output, apiItem);
                break;
            case "Interface" /* Interface */:
                this._writeInterfaceTables(output, apiItem);
                break;
            case "Constructor" /* Constructor */:
            case "ConstructSignature" /* ConstructSignature */:
            case "Method" /* Method */:
            case "MethodSignature" /* MethodSignature */:
            case "Function" /* Function */:
                this._writeParameterTables(output, apiItem);
                this._writeThrowsSection(output, apiItem);
                break;
            case "Namespace" /* Namespace */:
                this._writePackageOrNamespaceTables(output, apiItem);
                break;
            case "Model" /* Model */:
                this._writeModelTable(output, apiItem);
                break;
            case "Package" /* Package */:
                this._writePackageOrNamespaceTables(output, apiItem);
                break;
            case "Property" /* Property */:
            case "PropertySignature" /* PropertySignature */:
                break;
            case "TypeAlias" /* TypeAlias */:
                break;
            case "Variable" /* Variable */:
                break;
            default:
                throw new Error('Unsupported API item kind: ' + apiItem.kind);
        }
        if (appendRemarks) {
            this._writeRemarksSection(output, apiItem);
        }
        /*
        /
        / Fluid hack: only generate doc for the public API
        /
        */
        const pkg = apiItem.getAssociatedPackage();
        if (!pkg || !pkg.name.startsWith("@fluidframework")) {
            console.log(`skipping ${apiItem.getScopedNameWithinPackage()}`);
            if (pkg) {
                console.log(`\t${pkg.name} package isn't in the allowed list`);
            }
            return;
        }
        // temp hack to reduce the size of the generated content
        if (apiItem.kind !== "Package" /* Package */) {
            return;
        }
        const filename = path.join(this._outputFolder, this._getFilenameForApiItem(apiItem));
        const stringBuilder = new tsdoc_1.StringBuilder();
        this._writeFrontMatter(apiItem);
        stringBuilder.append(this._frontMatter.toString());
        stringBuilder.append('[//]: # (Do not edit this file. It is automatically generated by API Documenter.)\n\n'
        //'<!-- Do not edit this file. It is automatically generated by API Documenter. -->\n\n'
        );
        this._markdownEmitter.emit(stringBuilder, output, {
            contextApiItem: apiItem,
            onGetFilenameForApiItem: (apiItemForFilename) => {
                return this._getLinkFilenameForApiItem(apiItemForFilename);
            }
        });
        let pageContent = stringBuilder.toString();
        if (this._pluginLoader.markdownDocumenterFeature) {
            // Allow the plugin to customize the pageContent
            const eventArgs = {
                apiItem: apiItem,
                outputFilename: filename,
                pageContent: pageContent
            };
            this._pluginLoader.markdownDocumenterFeature.onBeforeWritePage(eventArgs);
            pageContent = eventArgs.pageContent;
        }
        node_core_library_1.FileSystem.writeFile(filename, pageContent, {
            convertLineEndings: this._documenterConfig ? this._documenterConfig.newlineKind : "\r\n" /* CrLf */,
            ensureFolderExists: true
        });
    }
    _writeHeritageTypes(output, apiItem) {
        const configuration = this._tsdocConfiguration;
        if (apiItem instanceof api_extractor_model_1.ApiClass) {
            if (apiItem.extendsType) {
                const extendsParagraph = new tsdoc_1.DocParagraph({ configuration }, [
                    new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true }, [
                        new tsdoc_1.DocPlainText({ configuration, text: 'Extends: ' })
                    ])
                ]);
                this._appendExcerptWithHyperlinks(extendsParagraph, apiItem.extendsType.excerpt);
                output.appendNode(extendsParagraph);
            }
            if (apiItem.implementsTypes.length > 0) {
                const extendsParagraph = new tsdoc_1.DocParagraph({ configuration }, [
                    new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true }, [
                        new tsdoc_1.DocPlainText({ configuration, text: 'Implements: ' })
                    ])
                ]);
                let needsComma = false;
                for (const implementsType of apiItem.implementsTypes) {
                    if (needsComma) {
                        extendsParagraph.appendNode(new tsdoc_1.DocPlainText({ configuration, text: ', ' }));
                    }
                    this._appendExcerptWithHyperlinks(extendsParagraph, implementsType.excerpt);
                    needsComma = true;
                }
                output.appendNode(extendsParagraph);
            }
        }
        if (apiItem instanceof api_extractor_model_1.ApiInterface) {
            if (apiItem.extendsTypes.length > 0) {
                const extendsParagraph = new tsdoc_1.DocParagraph({ configuration }, [
                    new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true }, [
                        new tsdoc_1.DocPlainText({ configuration, text: 'Extends: ' })
                    ])
                ]);
                let needsComma = false;
                for (const extendsType of apiItem.extendsTypes) {
                    if (needsComma) {
                        extendsParagraph.appendNode(new tsdoc_1.DocPlainText({ configuration, text: ', ' }));
                    }
                    this._appendExcerptWithHyperlinks(extendsParagraph, extendsType.excerpt);
                    needsComma = true;
                }
                output.appendNode(extendsParagraph);
            }
        }
    }
    _writeRemarksSection(output, apiItem) {
        if (apiItem instanceof api_extractor_model_1.ApiDocumentedItem) {
            const tsdocComment = apiItem.tsdocComment;
            if (tsdocComment) {
                // Write the @remarks block
                if (tsdocComment.remarksBlock) {
                    output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: 'Remarks' }));
                    this._appendSection(output, tsdocComment.remarksBlock.content);
                }
                // Write the @example blocks
                const exampleBlocks = tsdocComment.customBlocks.filter((x) => x.blockTag.tagNameWithUpperCase === tsdoc_1.StandardTags.example.tagNameWithUpperCase);
                let exampleNumber = 1;
                for (const exampleBlock of exampleBlocks) {
                    const heading = exampleBlocks.length > 1 ? `Example ${exampleNumber}` : 'Example';
                    output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: heading }));
                    this._appendSection(output, exampleBlock.content);
                    ++exampleNumber;
                }
            }
        }
    }
    _writeThrowsSection(output, apiItem) {
        if (apiItem instanceof api_extractor_model_1.ApiDocumentedItem) {
            const tsdocComment = apiItem.tsdocComment;
            if (tsdocComment) {
                // Write the @throws blocks
                const throwsBlocks = tsdocComment.customBlocks.filter((x) => x.blockTag.tagNameWithUpperCase === tsdoc_1.StandardTags.throws.tagNameWithUpperCase);
                if (throwsBlocks.length > 0) {
                    const heading = 'Exceptions';
                    output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: heading }));
                    for (const throwsBlock of throwsBlocks) {
                        this._appendSection(output, throwsBlock.content);
                    }
                }
            }
        }
    }
    _writeIndex(apiItem) {
        // const indexPath: string = path.join(this._outputFolder, '_index.md');
        // const output: StringBuilder = new StringBuilder();
        // output.append(`---\nTitle: API Reference\n---\n\n`);
        // // TODO:
        // FileSystem.writeFile(indexPath, output.toString());
    }
    /**
     * GENERATE PAGE: MODEL
     */
    _writeModelTable(output, apiModel) {
        const configuration = this._tsdocConfiguration;
        const packagesTable = new DocTable_1.DocTable({
            configuration,
            headerTitles: ['Package', 'Description']
        });
        for (const apiMember of apiModel.members) {
            const row = new DocTableRow_1.DocTableRow({ configuration }, [
                this._createTitleCell(apiMember),
                this._createDescriptionCell(apiMember)
            ]);
            switch (apiMember.kind) {
                case "Package" /* Package */:
                    packagesTable.addRow(row);
                    this._writeApiItemPage(apiMember);
                    break;
            }
        }
        if (packagesTable.rows.length > 0) {
            output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: 'Packages' }));
            output.appendNode(packagesTable);
        }
    }
    /**
     * GENERATE PAGE: PACKAGE or NAMESPACE
     */
    _writePackageOrNamespaceTables(output, apiContainer) {
        const configuration = this._tsdocConfiguration;
        const classesTable = new DocTable_1.DocTable({
            configuration,
            headerTitles: ['Class', 'Description']
        });
        const enumerationsTable = new DocTable_1.DocTable({
            configuration,
            headerTitles: ['Enumeration', 'Description']
        });
        const functionsTable = new DocTable_1.DocTable({
            configuration,
            headerTitles: ['Function', 'Description']
        });
        const interfacesTable = new DocTable_1.DocTable({
            configuration,
            headerTitles: ['Interface', 'Description']
        });
        const namespacesTable = new DocTable_1.DocTable({
            configuration,
            headerTitles: ['Namespace', 'Description']
        });
        const variablesTable = new DocTable_1.DocTable({
            configuration,
            headerTitles: ['Variable', 'Description']
        });
        const typeAliasesTable = new DocTable_1.DocTable({
            configuration,
            headerTitles: ['Type Alias', 'Description']
        });
        const apiMembers = apiContainer.kind === "Package" /* Package */
            ? apiContainer.entryPoints[0].members
            : apiContainer.members;
        for (const apiMember of apiMembers) {
            const row = new DocTableRow_1.DocTableRow({ configuration }, [
                this._createTitleCell(apiMember),
                this._createDescriptionCell(apiMember)
            ]);
            switch (apiMember.kind) {
                case "Class" /* Class */:
                    classesTable.addRow(row);
                    this._writeApiItemPage(apiMember);
                    break;
                case "Enum" /* Enum */:
                    enumerationsTable.addRow(row);
                    this._writeApiItemPage(apiMember);
                    break;
                case "Interface" /* Interface */:
                    interfacesTable.addRow(row);
                    this._writeApiItemPage(apiMember);
                    break;
                case "Namespace" /* Namespace */:
                    namespacesTable.addRow(row);
                    this._writeApiItemPage(apiMember);
                    break;
                case "Function" /* Function */:
                    functionsTable.addRow(row);
                    this._writeApiItemPage(apiMember);
                    break;
                case "TypeAlias" /* TypeAlias */:
                    typeAliasesTable.addRow(row);
                    this._writeApiItemPage(apiMember);
                    break;
                case "Variable" /* Variable */:
                    variablesTable.addRow(row);
                    this._writeApiItemPage(apiMember);
                    break;
            }
        }
        if (classesTable.rows.length > 0) {
            output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: 'Classes' }));
            output.appendNode(classesTable);
        }
        if (enumerationsTable.rows.length > 0) {
            output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: 'Enumerations' }));
            output.appendNode(enumerationsTable);
        }
        if (functionsTable.rows.length > 0) {
            output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: 'Functions' }));
            output.appendNode(functionsTable);
        }
        if (interfacesTable.rows.length > 0) {
            output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: 'Interfaces' }));
            output.appendNode(interfacesTable);
        }
        if (namespacesTable.rows.length > 0) {
            output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: 'Namespaces' }));
            output.appendNode(namespacesTable);
        }
        if (variablesTable.rows.length > 0) {
            output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: 'Variables' }));
            output.appendNode(variablesTable);
        }
        if (typeAliasesTable.rows.length > 0) {
            output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: 'Type Aliases' }));
            output.appendNode(typeAliasesTable);
        }
    }
    /**
     * GENERATE PAGE: CLASS
     */
    _writeClassTables(output, apiClass) {
        const configuration = this._tsdocConfiguration;
        const eventsTable = new DocTable_1.DocTable({
            configuration,
            headerTitles: ['Property', 'Modifiers', 'Type', 'Description']
        });
        const constructorsTable = new DocTable_1.DocTable({
            configuration,
            headerTitles: ['Constructor', 'Modifiers', 'Description']
        });
        const propertiesTable = new DocTable_1.DocTable({
            configuration,
            headerTitles: ['Property', 'Modifiers', 'Type', 'Description']
        });
        const methodsTable = new DocTable_1.DocTable({
            configuration,
            headerTitles: ['Method', 'Modifiers', 'Description']
        });
        for (const apiMember of apiClass.members) {
            switch (apiMember.kind) {
                case "Constructor" /* Constructor */: {
                    constructorsTable.addRow(new DocTableRow_1.DocTableRow({ configuration }, [
                        this._createTitleCell(apiMember),
                        this._createModifiersCell(apiMember),
                        this._createDescriptionCell(apiMember)
                    ]));
                    this._writeApiItemPage(apiMember);
                    break;
                }
                case "Method" /* Method */: {
                    methodsTable.addRow(new DocTableRow_1.DocTableRow({ configuration }, [
                        this._createTitleCell(apiMember),
                        this._createModifiersCell(apiMember),
                        this._createDescriptionCell(apiMember)
                    ]));
                    this._writeApiItemPage(apiMember);
                    break;
                }
                case "Property" /* Property */: {
                    if (apiMember.isEventProperty) {
                        eventsTable.addRow(new DocTableRow_1.DocTableRow({ configuration }, [
                            this._createTitleCell(apiMember),
                            this._createModifiersCell(apiMember),
                            this._createPropertyTypeCell(apiMember),
                            this._createDescriptionCell(apiMember)
                        ]));
                    }
                    else {
                        propertiesTable.addRow(new DocTableRow_1.DocTableRow({ configuration }, [
                            this._createTitleCell(apiMember),
                            this._createModifiersCell(apiMember),
                            this._createPropertyTypeCell(apiMember),
                            this._createDescriptionCell(apiMember)
                        ]));
                    }
                    this._writeApiItemPage(apiMember);
                    break;
                }
            }
        }
        if (eventsTable.rows.length > 0) {
            output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: 'Events' }));
            output.appendNode(eventsTable);
        }
        if (constructorsTable.rows.length > 0) {
            output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: 'Constructors' }));
            output.appendNode(constructorsTable);
        }
        if (propertiesTable.rows.length > 0) {
            output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: 'Properties' }));
            output.appendNode(propertiesTable);
        }
        if (methodsTable.rows.length > 0) {
            output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: 'Methods' }));
            output.appendNode(methodsTable);
        }
    }
    /**
     * GENERATE PAGE: ENUM
     */
    _writeEnumTables(output, apiEnum) {
        const configuration = this._tsdocConfiguration;
        const enumMembersTable = new DocTable_1.DocTable({
            configuration,
            headerTitles: ['Member', 'Value', 'Description']
        });
        for (const apiEnumMember of apiEnum.members) {
            enumMembersTable.addRow(new DocTableRow_1.DocTableRow({ configuration }, [
                new DocTableCell_1.DocTableCell({ configuration }, [
                    new tsdoc_1.DocParagraph({ configuration }, [
                        new tsdoc_1.DocPlainText({ configuration, text: Utilities_1.Utilities.getConciseSignature(apiEnumMember) })
                    ])
                ]),
                new DocTableCell_1.DocTableCell({ configuration }, [
                    new tsdoc_1.DocParagraph({ configuration }, [
                        new tsdoc_1.DocCodeSpan({ configuration, code: apiEnumMember.initializerExcerpt.text })
                    ])
                ]),
                this._createDescriptionCell(apiEnumMember)
            ]));
        }
        if (enumMembersTable.rows.length > 0) {
            output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: 'Enumeration Members' }));
            output.appendNode(enumMembersTable);
        }
    }
    /**
     * GENERATE PAGE: INTERFACE
     */
    _writeInterfaceTables(output, apiClass) {
        const configuration = this._tsdocConfiguration;
        const eventsTable = new DocTable_1.DocTable({
            configuration,
            headerTitles: ['Property', 'Type', 'Description']
        });
        const propertiesTable = new DocTable_1.DocTable({
            configuration,
            headerTitles: ['Property', 'Type', 'Description']
        });
        const methodsTable = new DocTable_1.DocTable({
            configuration,
            headerTitles: ['Method', 'Description']
        });
        for (const apiMember of apiClass.members) {
            switch (apiMember.kind) {
                case "ConstructSignature" /* ConstructSignature */:
                case "MethodSignature" /* MethodSignature */: {
                    methodsTable.addRow(new DocTableRow_1.DocTableRow({ configuration }, [
                        this._createTitleCell(apiMember),
                        this._createDescriptionCell(apiMember)
                    ]));
                    this._writeApiItemPage(apiMember);
                    break;
                }
                case "PropertySignature" /* PropertySignature */: {
                    if (apiMember.isEventProperty) {
                        eventsTable.addRow(new DocTableRow_1.DocTableRow({ configuration }, [
                            this._createTitleCell(apiMember),
                            this._createPropertyTypeCell(apiMember),
                            this._createDescriptionCell(apiMember)
                        ]));
                    }
                    else {
                        propertiesTable.addRow(new DocTableRow_1.DocTableRow({ configuration }, [
                            this._createTitleCell(apiMember),
                            this._createPropertyTypeCell(apiMember),
                            this._createDescriptionCell(apiMember)
                        ]));
                    }
                    this._writeApiItemPage(apiMember);
                    break;
                }
            }
        }
        if (eventsTable.rows.length > 0) {
            output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: 'Events' }));
            output.appendNode(eventsTable);
        }
        if (propertiesTable.rows.length > 0) {
            output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: 'Properties' }));
            output.appendNode(propertiesTable);
        }
        if (methodsTable.rows.length > 0) {
            output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: 'Methods' }));
            output.appendNode(methodsTable);
        }
    }
    /**
     * GENERATE PAGE: FUNCTION-LIKE
     */
    _writeParameterTables(output, apiParameterListMixin) {
        const configuration = this._tsdocConfiguration;
        const parametersTable = new DocTable_1.DocTable({
            configuration,
            headerTitles: ['Parameter', 'Type', 'Description']
        });
        for (const apiParameter of apiParameterListMixin.parameters) {
            const parameterDescription = new tsdoc_1.DocSection({ configuration });
            if (apiParameter.tsdocParamBlock) {
                this._appendSection(parameterDescription, apiParameter.tsdocParamBlock.content);
            }
            parametersTable.addRow(new DocTableRow_1.DocTableRow({ configuration }, [
                new DocTableCell_1.DocTableCell({ configuration }, [
                    new tsdoc_1.DocParagraph({ configuration }, [
                        new tsdoc_1.DocPlainText({ configuration, text: apiParameter.name })
                    ])
                ]),
                new DocTableCell_1.DocTableCell({ configuration }, [
                    this._createParagraphForTypeExcerpt(apiParameter.parameterTypeExcerpt)
                ]),
                new DocTableCell_1.DocTableCell({ configuration }, parameterDescription.nodes)
            ]));
        }
        if (parametersTable.rows.length > 0) {
            output.appendNode(new DocHeading_1.DocHeading({ configuration: this._tsdocConfiguration, title: 'Parameters' }));
            output.appendNode(parametersTable);
        }
        if (api_extractor_model_1.ApiReturnTypeMixin.isBaseClassOf(apiParameterListMixin)) {
            const returnTypeExcerpt = apiParameterListMixin.returnTypeExcerpt;
            output.appendNode(new tsdoc_1.DocParagraph({ configuration }, [
                new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true }, [
                    new tsdoc_1.DocPlainText({ configuration, text: 'Returns:' })
                ])
            ]));
            output.appendNode(this._createParagraphForTypeExcerpt(returnTypeExcerpt));
            if (apiParameterListMixin instanceof api_extractor_model_1.ApiDocumentedItem) {
                if (apiParameterListMixin.tsdocComment && apiParameterListMixin.tsdocComment.returnsBlock) {
                    this._appendSection(output, apiParameterListMixin.tsdocComment.returnsBlock.content);
                }
            }
        }
    }
    _createParagraphForTypeExcerpt(excerpt) {
        const configuration = this._tsdocConfiguration;
        const paragraph = new tsdoc_1.DocParagraph({ configuration });
        if (!excerpt.text.trim()) {
            paragraph.appendNode(new tsdoc_1.DocPlainText({ configuration, text: '(not declared)' }));
        }
        else {
            this._appendExcerptWithHyperlinks(paragraph, excerpt);
        }
        return paragraph;
    }
    _appendExcerptWithHyperlinks(docNodeContainer, excerpt) {
        const configuration = this._tsdocConfiguration;
        for (const token of excerpt.spannedTokens) {
            // Markdown doesn't provide a standardized syntax for hyperlinks inside code spans, so we will render
            // the type expression as DocPlainText.  Instead of creating multiple DocParagraphs, we can simply
            // discard any newlines and let the renderer do normal word-wrapping.
            const unwrappedTokenText = token.text.replace(/[\r\n]+/g, ' ');
            // If it's hyperlinkable, then append a DocLinkTag
            if (token.kind === "Reference" /* Reference */ && token.canonicalReference) {
                const apiItemResult = this._apiModel.resolveDeclarationReference(token.canonicalReference, undefined);
                if (apiItemResult.resolvedApiItem) {
                    docNodeContainer.appendNode(new tsdoc_1.DocLinkTag({
                        configuration,
                        tagName: '@link',
                        linkText: unwrappedTokenText,
                        urlDestination: this._getLinkFilenameForApiItem(apiItemResult.resolvedApiItem)
                    }));
                    continue;
                }
            }
            // Otherwise append non-hyperlinked text
            docNodeContainer.appendNode(new tsdoc_1.DocPlainText({ configuration, text: unwrappedTokenText }));
        }
    }
    _createTitleCell(apiItem) {
        const configuration = this._tsdocConfiguration;
        return new DocTableCell_1.DocTableCell({ configuration }, [
            new tsdoc_1.DocParagraph({ configuration }, [
                new tsdoc_1.DocLinkTag({
                    configuration,
                    tagName: '@link',
                    linkText: Utilities_1.Utilities.getConciseSignature(apiItem),
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
    _createDescriptionCell(apiItem) {
        const configuration = this._tsdocConfiguration;
        const section = new tsdoc_1.DocSection({ configuration });
        if (api_extractor_model_1.ApiReleaseTagMixin.isBaseClassOf(apiItem)) {
            if (apiItem.releaseTag === api_extractor_model_1.ReleaseTag.Beta) {
                section.appendNodesInParagraph([
                    new DocEmphasisSpan_1.DocEmphasisSpan({ configuration, bold: true, italic: true }, [
                        new tsdoc_1.DocPlainText({ configuration, text: '(BETA)' })
                    ]),
                    new tsdoc_1.DocPlainText({ configuration, text: ' ' })
                ]);
            }
        }
        if (apiItem instanceof api_extractor_model_1.ApiDocumentedItem) {
            if (apiItem.tsdocComment !== undefined) {
                this._appendAndMergeSection(section, apiItem.tsdocComment.summarySection);
            }
        }
        return new DocTableCell_1.DocTableCell({ configuration }, section.nodes);
    }
    _createModifiersCell(apiItem) {
        const configuration = this._tsdocConfiguration;
        const section = new tsdoc_1.DocSection({ configuration });
        if (api_extractor_model_1.ApiStaticMixin.isBaseClassOf(apiItem)) {
            if (apiItem.isStatic) {
                section.appendNodeInParagraph(new tsdoc_1.DocCodeSpan({ configuration, code: 'static' }));
            }
        }
        return new DocTableCell_1.DocTableCell({ configuration }, section.nodes);
    }
    _createPropertyTypeCell(apiItem) {
        const configuration = this._tsdocConfiguration;
        const section = new tsdoc_1.DocSection({ configuration });
        if (apiItem instanceof api_extractor_model_1.ApiPropertyItem) {
            section.appendNode(this._createParagraphForTypeExcerpt(apiItem.propertyTypeExcerpt));
        }
        return new DocTableCell_1.DocTableCell({ configuration }, section.nodes);
    }
    // prepare the markdown frontmatter by providing the metadata needed to nicely render the page.
    _writeFrontMatter(item) {
        // TODO: remove, if we generate a single page.
        this._frontMatter.kind = item.kind;
        this._frontMatter.title = item.canonicalReference.toString().replace(/"/g, '').replace(/!/g, ''); //item.getScopedNameWithinPackage().replace(/"/g, '');
        const pkg = item.getAssociatedPackage();
        if (pkg) {
            this._frontMatter.package = pkg.name.replace(/"/g, '').replace(/!/g, '');
        }
        else {
            this._frontMatter.package = "undefined";
        }
    }
    _writeBreadcrumb(output, apiItem) {
        output.appendNodeInParagraph(new tsdoc_1.DocLinkTag({
            configuration: this._tsdocConfiguration,
            tagName: '@link',
            linkText: 'Packages',
            urlDestination: this._getLinkFilenameForApiItem(this._apiModel)
        }));
        for (const hierarchyItem of apiItem.getHierarchy()) {
            switch (hierarchyItem.kind) {
                case "Model" /* Model */:
                case "EntryPoint" /* EntryPoint */:
                    // We don't show the model as part of the breadcrumb because it is the root-level container.
                    // We don't show the entry point because today API Extractor doesn't support multiple entry points;
                    // this may change in the future.
                    break;
                default:
                    output.appendNodesInParagraph([
                        new tsdoc_1.DocPlainText({
                            configuration: this._tsdocConfiguration,
                            text: ' > '
                        }),
                        new tsdoc_1.DocLinkTag({
                            configuration: this._tsdocConfiguration,
                            tagName: '@link',
                            linkText: hierarchyItem.displayName,
                            urlDestination: this._getLinkFilenameForApiItem(hierarchyItem)
                        })
                    ]);
            }
        }
    }
    _writeBetaWarning(output) {
        const configuration = this._tsdocConfiguration;
        const betaWarning = 'This API is provided as a preview for developers and may change' +
            ' based on feedback that we receive.  Do not use this API in a production environment.';
        output.appendNode(new DocNoteBox_1.DocNoteBox({ configuration }, [
            new tsdoc_1.DocParagraph({ configuration }, [new tsdoc_1.DocPlainText({ configuration, text: betaWarning })])
        ]));
    }
    _appendSection(output, docSection) {
        for (const node of docSection.nodes) {
            output.appendNode(node);
        }
    }
    _appendAndMergeSection(output, docSection) {
        let firstNode = true;
        for (const node of docSection.nodes) {
            if (firstNode) {
                if (node.kind === "Paragraph" /* Paragraph */) {
                    output.appendNodesInParagraph(node.getChildNodes());
                    firstNode = false;
                    continue;
                }
            }
            firstNode = false;
            output.appendNode(node);
        }
    }
    _getFilenameForApiItem(apiItem) {
        if (apiItem.kind === "Model" /* Model */) {
            return '/';
        }
        let baseName = '';
        for (const hierarchyItem of apiItem.getHierarchy()) {
            // For overloaded methods, add a suffix such as "MyClass.myMethod_2".
            let qualifiedName = Utilities_1.Utilities.getSafeFilenameForName(hierarchyItem.displayName);
            if (api_extractor_model_1.ApiParameterListMixin.isBaseClassOf(hierarchyItem)) {
                if (hierarchyItem.overloadIndex > 1) {
                    // Subtract one for compatibility with earlier releases of API Documenter.
                    // (This will get revamped when we fix GitHub issue #1308)
                    qualifiedName += `_${hierarchyItem.overloadIndex - 1}`;
                }
            }
            switch (hierarchyItem.kind) {
                case "Model" /* Model */:
                case "EntryPoint" /* EntryPoint */:
                    break;
                case "Package" /* Package */:
                    baseName = Utilities_1.Utilities.getSafeFilenameForName(node_core_library_1.PackageName.getUnscopedName(hierarchyItem.displayName));
                    break;
                default:
                    baseName += '/' + qualifiedName;
            }
        }
        return baseName + '.md';
    }
    /*
    /
    / Fluid Hack: set the /apis/ root path (should be in the config).
    /
    */
    _getLinkFilenameForApiItem(apiItem) {
        return '/apis/' + this._getFilenameForApiItem(apiItem);
    }
    _deleteOldOutputFiles() {
        console.log('Deleting old output from ' + this._outputFolder);
        node_core_library_1.FileSystem.ensureEmptyFolder(this._outputFolder);
    }
}
exports.MarkdownDocumenter = MarkdownDocumenter;
//# sourceMappingURL=MarkdownDocumenter.js.map
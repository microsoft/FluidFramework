"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const yaml = require("js-yaml");
const node_core_library_1 = require("@rushstack/node-core-library");
const tsdoc_1 = require("@microsoft/tsdoc");
const api_extractor_model_1 = require("@microsoft/api-extractor-model");
const Utilities_1 = require("../utils/Utilities");
const CustomMarkdownEmitter_1 = require("../markdown/CustomMarkdownEmitter");
const yamlApiSchema = node_core_library_1.JsonSchema.fromFile(path.join(__dirname, '..', 'yaml', 'typescript.schema.json'));
/**
 * Writes documentation in the Universal Reference YAML file format, as defined by typescript.schema.json.
 */
class YamlDocumenter {
    constructor(apiModel, newDocfxNamespaces = false) {
        this._apiModel = apiModel;
        this.newDocfxNamespaces = newDocfxNamespaces;
        this._markdownEmitter = new CustomMarkdownEmitter_1.CustomMarkdownEmitter(this._apiModel);
        this._apiItemsByCanonicalReference = new Map();
        this._initApiItems();
    }
    /** @virtual */
    generateFiles(outputFolder) {
        this._outputFolder = outputFolder;
        console.log();
        this._deleteOldOutputFiles();
        for (const apiPackage of this._apiModel.packages) {
            console.log(`Writing ${apiPackage.name} package`);
            this._visitApiItems(apiPackage, undefined);
        }
        this._writeTocFile(this._apiModel.packages);
    }
    /** @virtual */
    onGetTocRoot() {
        return {
            name: 'SharePoint Framework reference',
            href: '~/overview/sharepoint.md',
            items: []
        };
    }
    /** @virtual */
    onCustomizeYamlItem(yamlItem) {
        // virtual
        // (overridden by child class)
    }
    _visitApiItems(apiItem, parentYamlFile) {
        let savedYamlReferences;
        if (!this._shouldEmbed(apiItem.kind)) {
            savedYamlReferences = this._yamlReferences;
            this._yamlReferences = undefined;
        }
        const yamlItem = this._generateYamlItem(apiItem);
        if (!yamlItem) {
            return false;
        }
        this.onCustomizeYamlItem(yamlItem);
        if (this._shouldEmbed(apiItem.kind)) {
            if (!parentYamlFile) {
                throw new node_core_library_1.InternalError('Missing file context');
            }
            parentYamlFile.items.push(yamlItem);
        }
        else {
            const newYamlFile = {
                items: []
            };
            newYamlFile.items.push(yamlItem);
            const children = this._getLogicalChildren(apiItem);
            for (const child of children) {
                if (child instanceof api_extractor_model_1.ApiDocumentedItem) {
                    if (this._visitApiItems(child, newYamlFile)) {
                        if (!yamlItem.children) {
                            yamlItem.children = [];
                        }
                        yamlItem.children.push(this._getUid(child));
                    }
                }
            }
            if (this._yamlReferences && this._yamlReferences.references.length > 0) {
                newYamlFile.references = this._yamlReferences.references;
            }
            this._yamlReferences = savedYamlReferences;
            const yamlFilePath = this._getYamlFilePath(apiItem);
            if (apiItem.kind === "Package" /* Package */) {
                console.log('Writing ' + yamlFilePath);
            }
            this._writeYamlFile(newYamlFile, yamlFilePath, 'UniversalReference', yamlApiSchema);
            if (parentYamlFile) {
                // References should be recorded in the parent YAML file with the local name of the embedded item.
                // This avoids unnecessary repetition when listing items inside of a namespace.
                this._recordYamlReference(this._ensureYamlReferences(), this._getUid(apiItem), this._getYamlItemName(apiItem, {
                    includeNamespace: !this.newDocfxNamespaces,
                    includeSignature: true
                }), this._getYamlItemName(apiItem, { includeNamespace: true, includeSignature: true }));
            }
        }
        return true;
    }
    _getLogicalChildren(apiItem) {
        const children = [];
        if (apiItem.kind === "Package" /* Package */) {
            // Skip over the entry point, since it's not part of the documentation hierarchy
            this._flattenNamespaces(apiItem.members[0].members, children, this.newDocfxNamespaces ? 0 /* NestedNamespacesAndChildren */ : 3 /* NestedChildren */);
        }
        else {
            this._flattenNamespaces(apiItem.members, children, this.newDocfxNamespaces ? 2 /* ImmediateChildren */ : 3 /* NestedChildren */);
        }
        return children;
    }
    // Flattens nested namespaces into top level entries so that the following:
    //   namespace X { export namespace Y { export namespace Z { } }
    // Is represented as:
    //   - X
    //   - X.Y
    //   - X.Y.Z
    _flattenNamespaces(items, childrenOut, mode) {
        let hasNonNamespaceChildren = false;
        for (const item of items) {
            if (item.kind === "Namespace" /* Namespace */) {
                switch (mode) {
                    case 3 /* NestedChildren */:
                        // Include children of namespaces, but not the namespaces themselves. This matches existing legacy behavior.
                        this._flattenNamespaces(item.members, childrenOut, 3 /* NestedChildren */);
                        break;
                    case 1 /* NestedNamespacesOnly */:
                    case 0 /* NestedNamespacesAndChildren */:
                        // At any level, always include a nested namespace if it has non-namespace children, but do not include its
                        // non-namespace children in the result.
                        // Record the offset at which the namespace is added in case we need to remove it later.
                        const index = childrenOut.length;
                        childrenOut.push(item);
                        if (!this._flattenNamespaces(item.members, childrenOut, 1 /* NestedNamespacesOnly */)) {
                            // This namespace had no non-namespace children, remove it.
                            childrenOut.splice(index, 1);
                        }
                        break;
                }
            }
            else if (this._shouldInclude(item.kind)) {
                switch (mode) {
                    case 3 /* NestedChildren */:
                    case 0 /* NestedNamespacesAndChildren */:
                    case 2 /* ImmediateChildren */:
                        // At the top level, include non-namespace children as well.
                        childrenOut.push(item);
                        break;
                }
                hasNonNamespaceChildren = true;
            }
        }
        return hasNonNamespaceChildren;
    }
    /**
     * Write the table of contents
     */
    _writeTocFile(apiItems) {
        const tocFile = this.buildYamlTocFile(apiItems);
        const tocFilePath = path.join(this._outputFolder, 'toc.yml');
        console.log('Writing ' + tocFilePath);
        this._writeYamlFile(tocFile, tocFilePath, '', undefined);
    }
    /** @virtual */
    buildYamlTocFile(apiItems) {
        const tocFile = {
            items: []
        };
        const rootItem = this.onGetTocRoot();
        tocFile.items.push(rootItem);
        rootItem.items.push(...this._buildTocItems(apiItems));
        return tocFile;
    }
    _buildTocItems(apiItems) {
        const tocItems = [];
        for (const apiItem of apiItems) {
            let tocItem;
            if (apiItem.kind === "Namespace" /* Namespace */ && !this.newDocfxNamespaces) {
                tocItem = {
                    name: this._getTocItemName(apiItem)
                };
            }
            else {
                if (this._shouldEmbed(apiItem.kind)) {
                    // Don't generate table of contents items for embedded definitions
                    continue;
                }
                tocItem = {
                    name: this._getTocItemName(apiItem),
                    uid: this._getUid(apiItem)
                };
            }
            tocItems.push(tocItem);
            const children = this._getLogicalChildren(apiItem);
            const childItems = this._buildTocItems(children);
            if (childItems.length > 0) {
                tocItem.items = childItems;
            }
        }
        return tocItems;
    }
    /** @virtual */
    _getTocItemName(apiItem) {
        let name;
        if (apiItem.kind === "Package" /* Package */) {
            name = node_core_library_1.PackageName.getUnscopedName(apiItem.displayName);
        }
        else {
            name = this._getYamlItemName(apiItem);
        }
        if (name === apiItem.displayName && apiItem.getMergedSiblings().length > 1) {
            name += ` (${apiItem.kind})`;
        }
        return name;
    }
    _shouldEmbed(apiItemKind) {
        switch (apiItemKind) {
            case "Class" /* Class */:
            case "Package" /* Package */:
            case "Interface" /* Interface */:
            case "Enum" /* Enum */:
                return false;
            case "Namespace" /* Namespace */:
                return !this.newDocfxNamespaces;
        }
        return true;
    }
    _shouldInclude(apiItemKind) {
        // Filter out known items that are not yet supported
        switch (apiItemKind) {
            case "CallSignature" /* CallSignature */:
            case "ConstructSignature" /* ConstructSignature */:
            case "IndexSignature" /* IndexSignature */:
                return false;
        }
        return true;
    }
    _generateYamlItem(apiItem) {
        // Filter out known items that are not yet supported
        if (!this._shouldInclude(apiItem.kind)) {
            return undefined;
        }
        const uid = this._getUidObject(apiItem);
        const yamlItem = {
            uid: uid.toString()
        };
        if (apiItem.tsdocComment) {
            const tsdocComment = apiItem.tsdocComment;
            if (tsdocComment.summarySection) {
                const summary = this._renderMarkdown(tsdocComment.summarySection, apiItem);
                if (summary) {
                    yamlItem.summary = summary;
                }
            }
            if (tsdocComment.remarksBlock) {
                const remarks = this._renderMarkdown(tsdocComment.remarksBlock.content, apiItem);
                if (remarks) {
                    yamlItem.remarks = remarks;
                }
            }
            if (tsdocComment.deprecatedBlock) {
                const deprecatedMessage = this._renderMarkdown(tsdocComment.deprecatedBlock.content, apiItem);
                if (deprecatedMessage.length > 0) {
                    yamlItem.deprecated = { content: deprecatedMessage };
                }
            }
        }
        if (api_extractor_model_1.ApiReleaseTagMixin.isBaseClassOf(apiItem)) {
            if (apiItem.releaseTag === api_extractor_model_1.ReleaseTag.Beta) {
                yamlItem.isPreview = true;
            }
        }
        yamlItem.name = this._getYamlItemName(apiItem, {
            includeSignature: true,
            includeNamespace: !this.newDocfxNamespaces
        });
        yamlItem.fullName = this._getYamlItemName(apiItem, { includeSignature: true, includeNamespace: true });
        yamlItem.langs = ['typeScript'];
        // Add the namespace of the item if it is contained in one.
        // Do not add the namespace parent of a namespace as they are flattened in the documentation.
        if (apiItem.kind !== "Namespace" /* Namespace */ &&
            apiItem.parent &&
            apiItem.parent.kind === "Namespace" /* Namespace */ &&
            this.newDocfxNamespaces) {
            yamlItem.namespace = apiItem.parent.canonicalReference.toString();
        }
        switch (apiItem.kind) {
            case "Enum" /* Enum */:
                yamlItem.type = 'enum';
                break;
            case "EnumMember" /* EnumMember */:
                yamlItem.type = 'field';
                const enumMember = apiItem;
                if (enumMember.initializerExcerpt.text.length > 0) {
                    yamlItem.numericValue = enumMember.initializerExcerpt.text;
                }
                break;
            case "Class" /* Class */:
                yamlItem.type = 'class';
                this._populateYamlClassOrInterface(uid, yamlItem, apiItem);
                break;
            case "Interface" /* Interface */:
                yamlItem.type = 'interface';
                this._populateYamlClassOrInterface(uid, yamlItem, apiItem);
                break;
            case "Method" /* Method */:
            case "MethodSignature" /* MethodSignature */:
                yamlItem.type = 'method';
                this._populateYamlFunctionLike(uid, yamlItem, apiItem);
                break;
            case "Constructor" /* Constructor */:
                yamlItem.type = 'constructor';
                this._populateYamlFunctionLike(uid, yamlItem, apiItem);
                break;
            case "Package" /* Package */:
                yamlItem.type = 'package';
                break;
            case "Namespace" /* Namespace */:
                yamlItem.type = 'namespace';
                break;
            case "Property" /* Property */:
            case "PropertySignature" /* PropertySignature */:
                const apiProperty = apiItem;
                if (apiProperty.isEventProperty) {
                    yamlItem.type = 'event';
                }
                else {
                    yamlItem.type = 'property';
                }
                this._populateYamlProperty(uid, yamlItem, apiProperty);
                break;
            case "Function" /* Function */:
                yamlItem.type = 'function';
                this._populateYamlFunctionLike(uid, yamlItem, apiItem);
                break;
            case "Variable" /* Variable */:
                yamlItem.type = 'variable';
                this._populateYamlVariable(uid, yamlItem, apiItem);
                break;
            case "TypeAlias" /* TypeAlias */:
                yamlItem.type = 'typealias';
                this._populateYamlTypeAlias(uid, yamlItem, apiItem);
                break;
            default:
                throw new Error('Unimplemented item kind: ' + apiItem.kind);
        }
        if (apiItem.kind !== "Package" /* Package */ && !this._shouldEmbed(apiItem.kind)) {
            const associatedPackage = apiItem.getAssociatedPackage();
            if (!associatedPackage) {
                throw new Error('Unable to determine associated package for ' + apiItem.displayName);
            }
            yamlItem.package = this._getUid(associatedPackage);
        }
        return yamlItem;
    }
    _populateYamlTypeParameters(contextUid, apiItem) {
        const typeParameters = [];
        for (const apiTypeParameter of apiItem.typeParameters) {
            const typeParameter = {
                id: apiTypeParameter.name
            };
            if (apiTypeParameter.tsdocTypeParamBlock) {
                typeParameter.description = this._renderMarkdown(apiTypeParameter.tsdocTypeParamBlock.content, apiItem);
            }
            if (!apiTypeParameter.constraintExcerpt.isEmpty) {
                typeParameter.type = [this._renderType(contextUid, apiTypeParameter.constraintExcerpt)];
            }
            typeParameters.push(typeParameter);
        }
        return typeParameters;
    }
    _populateYamlClassOrInterface(uid, yamlItem, apiItem) {
        if (apiItem instanceof api_extractor_model_1.ApiClass) {
            if (apiItem.extendsType) {
                yamlItem.extends = [this._renderType(uid, apiItem.extendsType.excerpt)];
                yamlItem.inheritance = this._renderInheritance(uid, [apiItem.extendsType]);
            }
            if (apiItem.implementsTypes.length > 0) {
                yamlItem.implements = [];
                for (const implementsType of apiItem.implementsTypes) {
                    yamlItem.implements.push(this._renderType(uid, implementsType.excerpt));
                }
            }
        }
        else if (apiItem instanceof api_extractor_model_1.ApiInterface) {
            if (apiItem.extendsTypes.length > 0) {
                yamlItem.extends = [];
                for (const extendsType of apiItem.extendsTypes) {
                    yamlItem.extends.push(this._renderType(uid, extendsType.excerpt));
                }
                yamlItem.inheritance = this._renderInheritance(uid, apiItem.extendsTypes);
            }
            const typeParameters = this._populateYamlTypeParameters(uid, apiItem);
            if (typeParameters.length) {
                yamlItem.syntax = { typeParameters };
            }
        }
        if (apiItem.tsdocComment) {
            if (apiItem.tsdocComment.modifierTagSet.isSealed()) {
                let sealedMessage;
                if (apiItem.kind === "Class" /* Class */) {
                    sealedMessage = 'This class is marked as `@sealed`. Subclasses should not extend it.';
                }
                else {
                    sealedMessage = 'This interface is marked as `@sealed`. Other interfaces should not extend it.';
                }
                if (!yamlItem.remarks) {
                    yamlItem.remarks = sealedMessage;
                }
                else {
                    yamlItem.remarks = sealedMessage + '\n\n' + yamlItem.remarks;
                }
            }
        }
    }
    _populateYamlFunctionLike(uid, yamlItem, apiItem) {
        const syntax = {
            content: apiItem.getExcerptWithModifiers()
        };
        yamlItem.syntax = syntax;
        if (api_extractor_model_1.ApiReturnTypeMixin.isBaseClassOf(apiItem)) {
            const returnType = this._renderType(uid, apiItem.returnTypeExcerpt);
            let returnDescription = '';
            if (apiItem.tsdocComment && apiItem.tsdocComment.returnsBlock) {
                returnDescription = this._renderMarkdown(apiItem.tsdocComment.returnsBlock.content, apiItem);
                // temporary workaround for people who mistakenly add a hyphen, e.g. "@returns - blah"
                returnDescription = returnDescription.replace(/^\s*-\s+/, '');
            }
            if (returnType || returnDescription) {
                syntax.return = {
                    type: [returnType],
                    description: returnDescription
                };
            }
        }
        const parameters = [];
        for (const apiParameter of apiItem.parameters) {
            let parameterDescription = '';
            if (apiParameter.tsdocParamBlock) {
                parameterDescription = this._renderMarkdown(apiParameter.tsdocParamBlock.content, apiItem);
            }
            parameters.push({
                id: apiParameter.name,
                description: parameterDescription,
                type: [this._renderType(uid, apiParameter.parameterTypeExcerpt)]
            });
        }
        if (parameters.length) {
            syntax.parameters = parameters;
        }
        if (api_extractor_model_1.ApiTypeParameterListMixin.isBaseClassOf(apiItem)) {
            const typeParameters = this._populateYamlTypeParameters(uid, apiItem);
            if (typeParameters.length) {
                syntax.typeParameters = typeParameters;
            }
        }
    }
    _populateYamlProperty(uid, yamlItem, apiItem) {
        const syntax = {
            content: apiItem.getExcerptWithModifiers()
        };
        yamlItem.syntax = syntax;
        if (apiItem.propertyTypeExcerpt.text) {
            syntax.return = {
                type: [this._renderType(uid, apiItem.propertyTypeExcerpt)]
            };
        }
    }
    _populateYamlVariable(uid, yamlItem, apiItem) {
        const syntax = {
            content: apiItem.getExcerptWithModifiers()
        };
        yamlItem.syntax = syntax;
        if (apiItem.variableTypeExcerpt.text) {
            syntax.return = {
                type: [this._renderType(uid, apiItem.variableTypeExcerpt)]
            };
        }
    }
    _populateYamlTypeAlias(uid, yamlItem, apiItem) {
        const syntax = {
            content: apiItem.getExcerptWithModifiers()
        };
        yamlItem.syntax = syntax;
        const typeParameters = this._populateYamlTypeParameters(uid, apiItem);
        if (typeParameters.length) {
            syntax.typeParameters = typeParameters;
        }
        if (apiItem.typeExcerpt.text) {
            syntax.return = {
                type: [this._renderType(uid, apiItem.typeExcerpt)]
            };
        }
    }
    _renderMarkdown(docSection, contextApiItem) {
        const stringBuilder = new tsdoc_1.StringBuilder();
        this._markdownEmitter.emit(stringBuilder, docSection, {
            contextApiItem,
            onGetFilenameForApiItem: (apiItem) => {
                // NOTE: GitHub's markdown renderer does not resolve relative hyperlinks correctly
                // unless they start with "./" or "../".
                // To ensure the xref is properly escaped, we first encode the entire xref
                // to handle escaping of reserved characters. Then we must replace '#' and '?'
                // characters so that they are not interpreted as a querystring or hash.
                // We must also backslash-escape unbalanced `(` and `)` characters as the
                // markdown spec insists that they are only valid when balanced. To reduce
                // the overhead we only support balanced parenthesis with a depth of 1.
                return encodeURI(`xref:${this._getUid(apiItem)}`)
                    .replace(/[#?]/g, (s) => encodeURIComponent(s))
                    .replace(/(\([^(]*\))|[()]/g, (s, balanced) => balanced || '\\' + s);
            }
        });
        return stringBuilder.toString().trim();
    }
    _writeYamlFile(dataObject, filePath, yamlMimeType, schema) {
        node_core_library_1.JsonFile.validateNoUndefinedMembers(dataObject);
        let stringified = yaml.safeDump(dataObject, {
            lineWidth: 120
        });
        if (yamlMimeType) {
            stringified = `### YamlMime:${yamlMimeType}\n` + stringified;
        }
        node_core_library_1.FileSystem.writeFile(filePath, stringified, {
            convertLineEndings: "\r\n" /* CrLf */,
            ensureFolderExists: true
        });
        if (schema) {
            schema.validateObject(dataObject, filePath);
        }
    }
    /**
     * Calculate the DocFX "uid" for the ApiItem
     * Example:  `node-core-library!JsonFile#load`
     */
    _getUid(apiItem) {
        return this._getUidObject(apiItem).toString();
    }
    _getUidObject(apiItem) {
        return apiItem.canonicalReference;
    }
    /**
     * Initialize the _apiItemsByCanonicalReference data structure.
     */
    _initApiItems() {
        this._initApiItemsRecursive(this._apiModel);
    }
    /**
     * Helper for _initApiItems()
     */
    _initApiItemsRecursive(apiItem) {
        if (apiItem.canonicalReference && !apiItem.canonicalReference.isEmpty) {
            this._apiItemsByCanonicalReference.set(apiItem.canonicalReference.toString(), apiItem);
        }
        // Recurse container members
        if (api_extractor_model_1.ApiItemContainerMixin.isBaseClassOf(apiItem)) {
            for (const apiMember of apiItem.members) {
                this._initApiItemsRecursive(apiMember);
            }
        }
    }
    _ensureYamlReferences() {
        if (!this._yamlReferences) {
            this._yamlReferences = {
                references: [],
                typeNameToUid: new Map(),
                uidTypeReferenceCounters: new Map()
            };
        }
        return this._yamlReferences;
    }
    _renderInheritance(contextUid, heritageTypes) {
        const result = [];
        for (const heritageType of heritageTypes) {
            const type = this._renderType(contextUid, heritageType.excerpt);
            const yamlInheritance = { type };
            const apiItem = this._apiItemsByCanonicalReference.get(type);
            if (apiItem) {
                if (apiItem instanceof api_extractor_model_1.ApiClass) {
                    if (apiItem.extendsType) {
                        yamlInheritance.inheritance = this._renderInheritance(this._getUidObject(apiItem), [
                            apiItem.extendsType
                        ]);
                    }
                }
                else if (apiItem instanceof api_extractor_model_1.ApiInterface) {
                    if (apiItem.extendsTypes.length > 0) {
                        yamlInheritance.inheritance = this._renderInheritance(this._getUidObject(apiItem), apiItem.extendsTypes);
                    }
                }
            }
            result.push(yamlInheritance);
        }
        return result;
    }
    _renderType(contextUid, typeExcerpt) {
        const excerptTokens = [...typeExcerpt.spannedTokens]; // copy the read-only array
        if (excerptTokens.length === 0) {
            return '';
        }
        // Remove the last token if it consists only of whitespace
        const lastToken = excerptTokens[excerptTokens.length - 1];
        if (lastToken.kind === "Content" /* Content */ && !lastToken.text.trim()) {
            excerptTokens.pop();
            if (excerptTokens.length === 0) {
                return '';
            }
        }
        const typeName = typeExcerpt.text.trim();
        // If there are no references to be used for a complex type, return the type name.
        if (!excerptTokens.some((tok) => tok.kind === "Reference" /* Reference */ && !!tok.canonicalReference)) {
            return typeName;
        }
        const yamlReferences = this._ensureYamlReferences();
        const existingUid = yamlReferences.typeNameToUid.get(typeName);
        // If this type has already been referenced for the current file, return its uid.
        if (existingUid) {
            return existingUid;
        }
        // If the excerpt consists of a single reference token, record the reference.
        if (excerptTokens.length === 1 &&
            excerptTokens[0].kind === "Reference" /* Reference */ &&
            excerptTokens[0].canonicalReference) {
            const excerptRef = excerptTokens[0].canonicalReference.toString();
            const apiItem = this._apiItemsByCanonicalReference.get(excerptRef);
            return this._recordYamlReference(yamlReferences, excerptTokens[0].canonicalReference.toString(), apiItem ? this._getYamlItemName(apiItem) : typeName, apiItem ? this._getYamlItemName(apiItem, { includeNamespace: true }) : typeName);
        }
        // Otherwise, the type is complex and consists of one or more reference tokens. Record a reference
        // and return its uid.
        const baseUid = contextUid.withMeaning(undefined).withOverloadIndex(undefined).toString();
        // Keep track of the count for the base uid (without meaning or overload index) to ensure
        // that each complex type reference is unique.
        const counter = yamlReferences.uidTypeReferenceCounters.get(baseUid) || 0;
        yamlReferences.uidTypeReferenceCounters.set(baseUid, counter + 1);
        const uid = contextUid
            .addNavigationStep("~" /* Locals */, `${counter}`)
            .withMeaning("complex" /* ComplexType */)
            .withOverloadIndex(undefined)
            .toString();
        return this._recordYamlReference(yamlReferences, uid, typeName, typeName, excerptTokens);
    }
    _recordYamlReference(yamlReferences, uid, name, fullName, excerptTokens) {
        if (yamlReferences.references.some((ref) => ref.uid === uid)) {
            return uid;
        }
        // Fill in the reference spec from the excerpt.
        const specs = [];
        if (excerptTokens) {
            for (const token of excerptTokens) {
                if (token.kind === "Reference" /* Reference */) {
                    const spec = {};
                    const specUid = token.canonicalReference && token.canonicalReference.toString();
                    const apiItem = specUid
                        ? this._apiItemsByCanonicalReference.get(specUid)
                        : undefined;
                    if (specUid) {
                        spec.uid = specUid;
                    }
                    spec.name = token.text;
                    spec.fullName = apiItem
                        ? apiItem.getScopedNameWithinPackage()
                        : token.canonicalReference
                            ? token.canonicalReference
                                .withSource(undefined)
                                .withMeaning(undefined)
                                .withOverloadIndex(undefined)
                                .toString()
                            : token.text;
                    specs.push(spec);
                }
                else {
                    specs.push({
                        name: token.text,
                        fullName: token.text
                    });
                }
            }
        }
        const yamlReference = { uid };
        if (specs.length > 0) {
            yamlReference.name = specs
                .map((s) => s.name)
                .join('')
                .trim();
            yamlReference.fullName = specs
                .map((s) => s.fullName || s.name)
                .join('')
                .trim();
            yamlReference['spec.typeScript'] = specs;
        }
        else {
            if (name !== uid) {
                yamlReference.name = name;
            }
            if (fullName !== uid && fullName !== name) {
                yamlReference.fullName = fullName;
            }
        }
        yamlReferences.references.push(yamlReference);
        return uid;
    }
    _getYamlItemName(apiItem, options = {}) {
        const { includeSignature, includeNamespace } = options;
        const baseName = includeSignature ? Utilities_1.Utilities.getConciseSignature(apiItem) : apiItem.displayName;
        if ((includeNamespace || apiItem.kind === "Namespace" /* Namespace */) &&
            apiItem.parent &&
            apiItem.parent.kind === "Namespace" /* Namespace */) {
            // If the immediate parent is a namespace, then add the namespaces to the name.  For example:
            //
            //   // Name: "N1"
            //   export namespace N1 {
            //     // Name: "N1.N2"
            //     export namespace N2 {
            //       // Name: "N1.N2.f(x,y)"
            //       export function f(x: string, y: string): string {
            //         return x + y;
            //       }
            //
            //
            //       // Name: "N1.N2.C"
            //       export class C {
            //         // Name: "member(x,y)"  <===========
            //         public member(x: string, y: string): string {
            //           return x + y;
            //         }
            //       }
            //     }
            //   }
            //
            // In the above example, "member(x, y)" does not appear as "N1.N2.C.member(x,y)" because YamlDocumenter
            // embeds this entry in the web page for "N1.N2.C", so the container is obvious.  Whereas "N1.N2.f(x,y)"
            // needs to be qualified because the DocFX template doesn't make pages for namespaces.  Instead, they get
            // flattened into the package's page.
            const nameParts = [baseName];
            for (let current = apiItem.parent; current; current = current.parent) {
                if (current.kind !== "Namespace" /* Namespace */) {
                    break;
                }
                nameParts.unshift(current.displayName);
            }
            return nameParts.join('.');
        }
        else {
            return baseName;
        }
    }
    _getYamlFilePath(apiItem) {
        let result = '';
        for (const current of apiItem.getHierarchy()) {
            switch (current.kind) {
                case "Model" /* Model */:
                case "EntryPoint" /* EntryPoint */:
                    break;
                case "Package" /* Package */:
                    result += Utilities_1.Utilities.getSafeFilenameForName(node_core_library_1.PackageName.getUnscopedName(current.displayName));
                    break;
                default:
                    if (current.parent && current.parent.kind === "EntryPoint" /* EntryPoint */) {
                        result += '/';
                    }
                    else {
                        result += '.';
                    }
                    result += Utilities_1.Utilities.getSafeFilenameForName(current.displayName);
                    break;
            }
        }
        let disambiguator = '';
        if (apiItem.getMergedSiblings().length > 1) {
            disambiguator = `-${apiItem.kind.toLowerCase()}`;
        }
        return path.join(this._outputFolder, result + disambiguator + '.yml');
    }
    _deleteOldOutputFiles() {
        console.log('Deleting old output from ' + this._outputFolder);
        node_core_library_1.FileSystem.ensureEmptyFolder(this._outputFolder);
    }
}
exports.YamlDocumenter = YamlDocumenter;
//# sourceMappingURL=YamlDocumenter.js.map
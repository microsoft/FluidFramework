"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const colors = require("colors");
const path = require("path");
const yaml = require("js-yaml");
const node_core_library_1 = require("@rushstack/node-core-library");
const YamlDocumenter_1 = require("./YamlDocumenter");
/**
 * Extends YamlDocumenter with some custom logic that is specific to Office Add-ins.
 */
class OfficeYamlDocumenter extends YamlDocumenter_1.YamlDocumenter {
    constructor(apiModel, inputFolder, newDocfxNamespaces) {
        super(apiModel, newDocfxNamespaces);
        // Default API Set URL when no product match is found.
        this._apiSetUrlDefault = '/office/dev/add-ins/reference/javascript-api-for-office';
        // Hash set of API Set URLs based on product.
        this._apiSetUrls = {
            Excel: '/office/dev/add-ins/reference/requirement-sets/excel-api-requirement-sets',
            OneNote: '/office/dev/add-ins/reference/requirement-sets/onenote-api-requirement-sets',
            Visio: '/office/dev/add-ins/reference/overview/visio-javascript-reference-overview',
            Outlook: '/office/dev/add-ins/reference/requirement-sets/outlook-api-requirement-sets',
            Word: '/office/dev/add-ins/reference/requirement-sets/word-api-requirement-sets'
        };
        const snippetsFilePath = path.join(inputFolder, 'snippets.yaml');
        console.log('Loading snippets from ' + snippetsFilePath);
        const snippetsContent = node_core_library_1.FileSystem.readFile(snippetsFilePath);
        this._snippets = yaml.load(snippetsContent, { filename: snippetsFilePath });
        this._snippetsAll = yaml.load(snippetsContent, { filename: snippetsFilePath });
    }
    /** @override */
    generateFiles(outputFolder) {
        super.generateFiles(outputFolder);
        // After we generate everything, check for any unused snippets
        console.log();
        for (const apiName of Object.keys(this._snippets)) {
            console.error(colors.yellow('Warning: Unused snippet ' + apiName));
        }
    }
    /** @override */
    onGetTocRoot() {
        // override
        return {
            name: 'API reference',
            href: '~/docs-ref-autogen/overview/office.md',
            items: []
        };
    }
    /** @override */
    onCustomizeYamlItem(yamlItem) {
        const nameWithoutPackage = yamlItem.uid.replace(/^[^.]+\!/, '');
        if (yamlItem.summary) {
            yamlItem.summary = this._fixupApiSet(yamlItem.summary, yamlItem.uid);
            yamlItem.summary = this._fixBoldAndItalics(yamlItem.summary);
        }
        if (yamlItem.remarks) {
            yamlItem.remarks = this._fixupApiSet(yamlItem.remarks, yamlItem.uid);
            yamlItem.remarks = this._fixBoldAndItalics(yamlItem.remarks);
        }
        if (yamlItem.syntax && yamlItem.syntax.parameters) {
            yamlItem.syntax.parameters.forEach((part) => {
                if (part.description) {
                    part.description = this._fixBoldAndItalics(part.description);
                }
            });
        }
        const snippets = this._snippetsAll[nameWithoutPackage];
        if (snippets) {
            delete this._snippets[nameWithoutPackage];
            const snippetText = this._generateExampleSnippetText(snippets);
            if (yamlItem.remarks) {
                yamlItem.remarks += snippetText;
            }
            else if (yamlItem.syntax && yamlItem.syntax.return) {
                if (!yamlItem.syntax.return.description) {
                    yamlItem.syntax.return.description = '';
                }
                yamlItem.syntax.return.description += snippetText;
            }
            else {
                yamlItem.remarks = snippetText;
            }
        }
    }
    _fixupApiSet(markup, uid) {
        // Search for a pattern such as this:
        // \[Api set: ExcelApi 1.1\]
        //
        // Hyperlink it like this:
        // \[ [API set: ExcelApi 1.1](http://bing.com?type=excel) \]
        markup = markup.replace(/Api/, 'API');
        return markup.replace(/\\\[(API set:[^\]]+)\\\]/, '\\[ [$1](' + this._getApiSetUrl(uid) + ') \\]');
    }
    // Gets the link to the API set based on product context. Seeks a case-insensitve match in the hash set.
    _getApiSetUrl(uid) {
        for (const key of Object.keys(this._apiSetUrls)) {
            const regexp = new RegExp(key, 'i');
            if (regexp.test(uid)) {
                return this._apiSetUrls[key];
            }
        }
        return this._apiSetUrlDefault; // match not found.
    }
    _fixBoldAndItalics(text) {
        return node_core_library_1.Text.replaceAll(text, '\\*', '*');
    }
    _generateExampleSnippetText(snippets) {
        const text = ['\n\n#### Examples\n'];
        for (const snippet of snippets) {
            if (snippet.search(/await/) === -1) {
                text.push('```javascript');
            }
            else {
                text.push('```typescript');
            }
            text.push(snippet);
            text.push('```');
        }
        return text.join('\n');
    }
}
exports.OfficeYamlDocumenter = OfficeYamlDocumenter;
//# sourceMappingURL=OfficeYamlDocumenter.js.map
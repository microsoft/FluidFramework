"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const BaseAction_1 = require("./BaseAction");
const DocumenterConfig_1 = require("../documenters/DocumenterConfig");
const ExperimentalYamlDocumenter_1 = require("../documenters/ExperimentalYamlDocumenter");
const node_core_library_1 = require("@rushstack/node-core-library");
const MarkdownDocumenter_1 = require("../documenters/MarkdownDocumenter");
class GenerateAction extends BaseAction_1.BaseAction {
    constructor(parser) {
        super({
            actionName: 'generate',
            summary: 'EXPERIMENTAL',
            documentation: 'EXPERIMENTAL - This action is a prototype of a new config file driven mode of operation for' +
                ' API Documenter.  It is not ready for general usage yet.  Its design may change in the future.'
        });
    }
    onExecute() {
        // override
        // Look for the config file under the current folder
        let configFilePath = path.join(process.cwd(), DocumenterConfig_1.DocumenterConfig.FILENAME);
        // First try the current folder
        if (!node_core_library_1.FileSystem.exists(configFilePath)) {
            // Otherwise try the standard "config" subfolder
            configFilePath = path.join(process.cwd(), 'config', DocumenterConfig_1.DocumenterConfig.FILENAME);
            if (!node_core_library_1.FileSystem.exists(configFilePath)) {
                throw new Error(`Unable to find ${DocumenterConfig_1.DocumenterConfig.FILENAME} in the current folder or in a "config" subfolder`);
            }
        }
        const documenterConfig = DocumenterConfig_1.DocumenterConfig.loadFile(configFilePath);
        const apiModel = this.buildApiModel();
        if (documenterConfig.configFile.outputTarget === 'markdown') {
            const markdownDocumenter = new MarkdownDocumenter_1.MarkdownDocumenter(apiModel, documenterConfig);
            markdownDocumenter.generateFiles(this.outputFolder);
        }
        else {
            const yamlDocumenter = new ExperimentalYamlDocumenter_1.ExperimentalYamlDocumenter(apiModel, documenterConfig);
            yamlDocumenter.generateFiles(this.outputFolder);
        }
        return Promise.resolve();
    }
}
exports.GenerateAction = GenerateAction;
//# sourceMappingURL=GenerateAction.js.map
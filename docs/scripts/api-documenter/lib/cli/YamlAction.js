"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAction_1 = require("./BaseAction");
const YamlDocumenter_1 = require("../documenters/YamlDocumenter");
const OfficeYamlDocumenter_1 = require("../documenters/OfficeYamlDocumenter");
class YamlAction extends BaseAction_1.BaseAction {
    constructor(parser) {
        super({
            actionName: 'yaml',
            summary: 'Generate documentation as universal reference YAML files (*.yml)',
            documentation: 'Generates API documentation as a collection of files conforming' +
                ' to the universal reference YAML format, which is used by the docs.microsoft.com' +
                ' pipeline.'
        });
    }
    onDefineParameters() {
        // override
        super.onDefineParameters();
        this._officeParameter = this.defineFlagParameter({
            parameterLongName: '--office',
            description: `Enables some additional features specific to Office Add-ins`
        });
        this._newDocfxNamespacesParameter = this.defineFlagParameter({
            parameterLongName: '--new-docfx-namespaces',
            description: `This enables an experimental feature that will be officially released with the next major version` +
                ` of API Documenter.  It requires DocFX 2.46 or newer.  It enables documentation for namespaces and` +
                ` adds them to the table of contents.  This will also affect file layout as namespaced items will be nested` +
                ` under a directory for the namespace instead of just within the package.`
        });
    }
    onExecute() {
        // override
        const apiModel = this.buildApiModel();
        const yamlDocumenter = this._officeParameter.value
            ? new OfficeYamlDocumenter_1.OfficeYamlDocumenter(apiModel, this.inputFolder, this._newDocfxNamespacesParameter.value)
            : new YamlDocumenter_1.YamlDocumenter(apiModel, this._newDocfxNamespacesParameter.value);
        yamlDocumenter.generateFiles(this.outputFolder);
        return Promise.resolve();
    }
}
exports.YamlAction = YamlAction;
//# sourceMappingURL=YamlAction.js.map
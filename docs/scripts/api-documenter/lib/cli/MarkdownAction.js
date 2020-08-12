"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAction_1 = require("./BaseAction");
const MarkdownDocumenter_1 = require("../documenters/MarkdownDocumenter");
class MarkdownAction extends BaseAction_1.BaseAction {
    constructor(parser) {
        super({
            actionName: 'markdown',
            summary: 'Generate documentation as Markdown files (*.md)',
            documentation: 'Generates API documentation as a collection of files in' +
                ' Markdown format, suitable for example for publishing on a GitHub site.'
        });
    }
    onExecute() {
        // override
        const apiModel = this.buildApiModel();
        const markdownDocumenter = new MarkdownDocumenter_1.MarkdownDocumenter(apiModel, undefined);
        markdownDocumenter.generateFiles(this.outputFolder);
        return Promise.resolve();
    }
}
exports.MarkdownAction = MarkdownAction;
//# sourceMappingURL=MarkdownAction.js.map
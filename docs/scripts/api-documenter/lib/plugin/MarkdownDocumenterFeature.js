"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const PluginFeature_1 = require("./PluginFeature");
/**
 * Context object for {@link MarkdownDocumenterFeature}.
 * Exposes various services that can be used by a plugin.
 *
 * @public
 */
class MarkdownDocumenterFeatureContext {
    /** @internal */
    constructor(options) {
        this.apiModel = options.apiModel;
        this.outputFolder = options.outputFolder;
        this.documenter = options.documenter;
    }
}
exports.MarkdownDocumenterFeatureContext = MarkdownDocumenterFeatureContext;
/**
 * Inherit from this base class to implement an API Documenter plugin feature that customizes
 * the generation of markdown output.
 *
 * @public
 */
class MarkdownDocumenterFeature extends PluginFeature_1.PluginFeature {
    /**
     * This event occurs before each markdown file is written.  It provides an opportunity to customize the
     * content of the file.
     * @virtual
     */
    onBeforeWritePage(eventArgs) {
        // (implemented by child class)
    }
    /**
     * This event occurs after all output files have been written.
     * @virtual
     */
    onFinished(eventArgs) {
        // (implemented by child class)
    }
}
exports.MarkdownDocumenterFeature = MarkdownDocumenterFeature;
//# sourceMappingURL=MarkdownDocumenterFeature.js.map
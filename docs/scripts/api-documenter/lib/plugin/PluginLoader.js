"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const resolve = require("resolve");
const PluginFeature_1 = require("./PluginFeature");
class PluginLoader {
    load(documenterConfig, createContext) {
        const configFileFolder = path.dirname(documenterConfig.configFilePath);
        for (const configPlugin of documenterConfig.configFile.plugins || []) {
            try {
                // Look for the package name in the same place as the config file
                const resolvedEntryPointPath = resolve.sync(configPlugin.packageName, {
                    basedir: configFileFolder
                });
                // Load the package
                const entryPoint = require(resolvedEntryPointPath);
                if (!entryPoint) {
                    throw new Error('Invalid entry point');
                }
                const manifest = 
                // eslint-disable-next-line dot-notation
                entryPoint['apiDocumenterPluginManifest'];
                if (!manifest) {
                    throw new Error(`The package is not an API documenter plugin;` +
                        ` the "apiDocumenterPluginManifest" export was not found`);
                }
                if (manifest.manifestVersion !== 1000) {
                    throw new Error(`The plugin is not compatible with this version of API Documenter;` +
                        ` unsupported manifestVersion`);
                }
                const loadedPlugin = {
                    packageName: configPlugin.packageName,
                    manifest
                };
                const featureDefinitionsByName = new Map();
                for (const featureDefinition of manifest.features) {
                    featureDefinitionsByName.set(featureDefinition.featureName, featureDefinition);
                }
                for (const featureName of configPlugin.enabledFeatureNames) {
                    const featureDefinition = featureDefinitionsByName.get(featureName);
                    if (!featureDefinition) {
                        throw new Error(`The plugin ${loadedPlugin.packageName} does not have a feature with name "${featureName}"`);
                    }
                    if (featureDefinition.kind === 'MarkdownDocumenterFeature') {
                        if (this.markdownDocumenterFeature) {
                            throw new Error('A MarkdownDocumenterFeature is already loaded');
                        }
                        const initialization = new PluginFeature_1.PluginFeatureInitialization();
                        initialization._context = createContext();
                        let markdownDocumenterFeature = undefined;
                        try {
                            markdownDocumenterFeature = new featureDefinition.subclass(initialization);
                        }
                        catch (e) {
                            throw new Error(`Failed to construct feature subclass:\n` + e.toString());
                        }
                        try {
                            markdownDocumenterFeature.onInitialized();
                        }
                        catch (e) {
                            throw new Error('Error occurred during the onInitialized() event: ' + e.toString());
                        }
                        this.markdownDocumenterFeature = markdownDocumenterFeature;
                    }
                    else {
                        throw new Error(`Unknown feature definition kind: "${featureDefinition.kind}"`);
                    }
                }
            }
            catch (e) {
                throw new Error(`Error loading plugin ${configPlugin.packageName}: ` + e.message);
            }
        }
    }
}
exports.PluginLoader = PluginLoader;
//# sourceMappingURL=PluginLoader.js.map
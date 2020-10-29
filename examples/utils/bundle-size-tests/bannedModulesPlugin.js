/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// @ts-check
const pluginName = "BannedModulesPlugin";

/**
 * Webpack plugin that enforces that certain modules are not included in final bundles
 */
class BannedModulesPlugin {
    /**
     * @typedef {{moduleName: string, reason: string}} BannedModule
     * @param {{bannedModules: BannedModule[] }} options
     */
    constructor(options) {
        if (!options || !Array.isArray(options.bannedModules)) {
            throw new Error(`${pluginName} must have a config object with a bannedModules array as a property`);
        }
        this.options = options;
    }

    apply(compiler) {
        /**
         * The banned modules that have been found. Maps the banned module name to an array of module paths that import the banned module
         * @type {Map<BannedModule, Set<string>>}
         */
        const foundBannedModules = new Map();

        compiler.hooks.done.tap(pluginName, (
            stats) => {
                stats.toJson().modules.forEach((mod)=> {
                    // Infer the name of the package from the path. This current implementation assumes the name has 'node_modules/<packageName>' in it somewhere
                    // modulePath should contain the relative path to the module, where the first part of the path should be the module name (e.g. assert/build/assert.js)
                    const modulePath = mod.name.substring(mod.name.indexOf("node_modules") + "node_modules".length + 1);

                    for (const bannedModule of this.options.bannedModules) {
                        const bannedModuleName = bannedModule.moduleName;
                        if (modulePath.startsWith(bannedModuleName)) {
                            // We store the issuers as a set to remove duplicates
                            const bannedModuleIssuers = foundBannedModules.get(bannedModule) || new Set();
                            bannedModuleIssuers.add(JSON.stringify(mod.issuerPath));
                            foundBannedModules.set(bannedModule, bannedModuleIssuers);
                            break;
                        }
                    }
                });
                if (foundBannedModules.size > 0) {
                    let errorMessage = `Found ${foundBannedModules.size} banned modules\n`;
                    foundBannedModules.forEach((issuerPaths, bannedModule)=> {
                        errorMessage += `\tBanned module: ${bannedModule.moduleName}\n`;
                        errorMessage += `\tReason: ${bannedModule.reason}\n`;
                        // Generate a string with a friendly issuer map path so that we can easily debug why a banned module is being included
                        issuerPaths.forEach((issuerPathJson) => {
                            errorMessage += `\t\tIssuer: \n`;
                            JSON.parse(issuerPathJson).forEach((segment) => errorMessage += `\t\t\t${segment.name}\n`);
                        });
                    });
                    throw new Error(errorMessage);
                }
            });
    }
}

module.exports = BannedModulesPlugin;

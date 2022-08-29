/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Webpack from "webpack";

const pluginName = "BannedModulesPlugin";

export interface BannedModule {
    /** The package name of the module that should not appear in the bundle */
    moduleName: string;

    /** The reason to ban the module */
    reason: string;
}

export interface BannedModulesPluginOptions {
    bannedModules: BannedModule[];
}


/**
 * Webpack plugin that enforces that certain modules are not included in any chunk of a webpack bundle
 */
export class BannedModulesPlugin {

    constructor(private readonly options: BannedModulesPluginOptions) {
        if (!options || !Array.isArray(options.bannedModules)) {
            throw new Error(`${pluginName} must have a config object with a bannedModules array as a property`);
        }
    }

    apply(compiler: Webpack.Compiler) {
        // The banned modules that have been found. Maps the banned module name to an array of module paths that import the banned module
        const foundBannedModules = new Map<BannedModule, Set<string>>();

        compiler.hooks.done.tap(pluginName, (
            stats) => {
                stats.toJson().modules?.forEach((mod)=> {
                    // Infer the name of the package from the path. This current implementation assumes the name has 'node_modules/<packageName>' in it somewhere
                    // modulePath should contain the relative path to the module, where the first part of the path should be the module name (e.g. assert/build/assert.js)
                    const modulePath = mod.name?.substring(mod.name.indexOf("node_modules") + "node_modules".length + 1);

                    for (const bannedModule of this.options.bannedModules) {
                        if (modulePath?.startsWith(bannedModule.moduleName)) {
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
                            const pathSegments: { name: string }[] = JSON.parse(issuerPathJson);
                            pathSegments.forEach((segment) => errorMessage += `\t\t\t${segment.name}\n`);
                        });
                    });
                    throw new Error(errorMessage);
                }
            });
    }
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
const findRoot = require('find-root');
const path = require('path');

//@ts-check
const pluginName = 'BannedModulesPlugin';

/**
 * Webpack plugin that enforces that certain modules are not included in final bundles
 */
class BannedModulesPlugin {
    /**
    * @typedef {Object} BannedModulesPluginOptions
    * @property {string[]} bannedModules - The package name of the module that should not be included in the final bundles
    * @param {BannedModulesPluginOptions} options
     */
    constructor(options) {
        if (!options || !Array.isArray(options.bannedModules)) {
            throw new Error(`${pluginName} must have a config object with a bannedModules array as a property`)
        }
        this.options = options;
    }

    apply(compiler) {
        // The banned modules that have been found. Maps the banned module name to an array of module paths that import the banned module
        const foundBannedModules = new Map();
        // A set for quick lookup to see if a module is banned
        const bannedModuleSet = new Set(this.options.bannedModules);
                
        compiler.hooks.emit.tapAsync(pluginName, (
            compilation) => {
                compilation.modules.forEach(mod=> {
                    // mod.resource has the path to the module being requested, we use find root to get the nearest package.json folder
                    const dir = findRoot(mod.resource);
                    const pkg = require(path.join(dir, 'package.json'));

                    if (bannedModuleSet.has(pkg.name)) {
                        // Let's add the new issuer for this banned module to the banned modules map
                        const bannedModuleIssuers = foundBannedModules.get(pkg.name) || [];
                        bannedModuleIssuers.push(mod.issuerPath);
                        foundBannedModules.set(pkg.name, bannedModuleIssuers);
                        debugger;
                    }
                });
                if (foundBannedModules.size > 0) {
                    let errorMessage = `Found ${foundBannedModules.size} banned modules\n`;
                    foundBannedModules.forEach((issuers, pkgName)=> {
                        errorMessage += `\tBanned module: ${pkgName}\n`;
                        issuers.forEach(issuer => {
                            errorMessage += `\t\tIssuer: ${issuer}\n`
                        })
                    })
                    throw new Error(errorMessage);
                }
            });
    }

}

module.exports = BannedModulesPlugin;
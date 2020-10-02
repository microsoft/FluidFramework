/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Fluid-specific properties expected on a package to be loaded by the Fluid code loader
 */
export interface IFluidPackage {
    name: string;
    version: string;
    // https://stackoverflow.com/questions/10065564/add-custom-metadata-or-config-to-package-json-is-it-valid
    fluid: {
        browser: {
            [libraryTarget: string]: {
                // List of bundled JS files. Absolute URLs will be loaded directly. Relative paths will be specific
                // to the CDN location
                files: string[];

                // If libraryTarget is umd then library is the global name that the script entry points will be exposed
                // under. Other target formats may choose to reinterpret this value.
                library: string;
            };
        };
    };
    // General access for extended fields
    [key: string]: any;
}

/**
 * Check if the package.json defines a Fluid module, which requires a `fluid` entry
 * @param pkg - the package json data to check if it is a Fluid package.
 */
export const isFluidPackage = (pkg: any): pkg is IFluidPackage =>
    pkg.fluid?.browser?.umd !== undefined;

/**
 * Package manager configuration. Provides a key value mapping of config values
 */
export interface IPackageConfig {
    [key: string]: string;
}

/**
 * Data structure used to describe the code to load on the Fluid document
 */
export interface IFluidCodeDetails {
    /**
     * The code package to be used on the Fluid document. This is either the package name which will be loaded
     * from a package manager. Or the expanded Fluid package.
     */
    package: string | IFluidPackage;

    /**
     * Configuration details. This includes links to the package manager and base CDNs.
     */
    config: IPackageConfig;
}

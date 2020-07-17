/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Person definition in a npm script
 */
export interface IPerson {
    name: string;
    email: string;
    url: string;
}

/**
 * Typescript interface definition for fields within a npm module's package.json.
 */
export interface IPackage {
    // General access for extended fields
    [key: string]: any;
    name: string;
    version: string;
    description?: string;
    keywords?: string[];
    homepage?: string;
    bugs?: { url: string; email: string };
    license?: string;
    author?: IPerson;
    contributors?: IPerson[];
    files?: string[];
    main?: string;
    // Same as main but for browser based clients (check if webpack supports this)
    browser?: string;
    bin?: { [key: string]: string };
    man?: string | string[];
    repository?: string | { type: string; url: string };
    scripts?: { [key: string]: string };
    config?: { [key: string]: string };
    dependencies?: { [key: string]: string };
    devDependencies?: { [key: string]: string };
    peerDependencies?: { [key: string]: string };
    bundledDependencies?: { [key: string]: string };
    optionalDependencies?: { [key: string]: string };
    engines?: { node: string; npm: string };
    os?: string[];
    cpu?: string[];
    private?: boolean;
}

export interface IFluidPackage extends IPackage {
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
}

/**
 * Check if the package.json defines a fluid module, which requires a `fluid` entry
 * @param pkg - the package json data to check if it is a fluid package.
 */
export const isFluidPackage = (pkg: IPackage): pkg is IFluidPackage =>
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
     * from a package manager. Or the expanded fluid package.
     */
    package: string | IFluidPackage;

    /**
     * Configuration details. This includes links to the package manager and base CDNs.
     */
    config: IPackageConfig;
}

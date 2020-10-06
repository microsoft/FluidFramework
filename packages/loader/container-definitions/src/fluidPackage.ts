/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

 /**
  * Specifies an environment on Fluid property of a IFluidPackage
  */
export interface IFluidPackageEnvironment {

    /**
     * The name of the target. For a browser environment, this could be umd for scripts
     * or css for styles.
     */
    [target: string]: undefined | {
        /**
         * List of files. The file type in determined by library target
         */
        files: string[];

        /**
         * If libraryTarget is umd then library is the global name that the script entry points will be exposed
         * under. Other target formats may choose to reinterpret this value.
         */
        library?: string;
    }
}

/**
 * Fluid-specific properties expected on a package to be loaded by the  code loader.
 * While compatible with the npm package format it is not necessary that that package is an
 * npm package:
 * https://stackoverflow.com/questions/10065564/add-custom-metadata-or-config-to-package-json-is-it-valid
 */
export interface IFluidPackage {
    /**
     * The name of the package that this code represnets
     */
    name: string;
    /**
     * This object represents the Fluid specific properties of the package
     */
    fluid: {
        /**
         * The name of the of the environment. This should be something like browser, or node
         * and contain the necessary targets for loading this code in that environment.
         */
        [environment: string]:  undefined | IFluidPackageEnvironment;
    };
    /**
     * General access for extended fields as specific usages will
     * likely have additional infornamation like a definition of
     * compatible versions, or deployment information like rings or rollouts.
     */
    [key: string]: any;}

/**
 * Check if the package.json defines a Fluid module, which requires a `fluid` entry
 * @param pkg - the package json data to check if it is a Fluid package.
 */
export const isFluidPackage = (pkg: any): pkg is Readonly<IFluidPackage> =>
    typeof pkg === "object"
    && typeof pkg?.name === "string"
    && typeof pkg?.fluid === "object";

/**
 * Package manager configuration. Provides a key value mapping of config values
 */
export interface IFluidCodeDetailsConfig {
    readonly [key: string]: string;
}

/**
 * Data structure used to describe the code to load on the Fluid document
 */
export interface IFluidCodeDetails {
    /**
     * The code package to be used on the Fluid document. This is either the package name which will be loaded
     * from a package manager. Or the expanded Fluid package.
     */
    readonly package: string | Readonly<IFluidPackage>;

    /**
     * Configuration details. This includes links to the package manager and base CDNs.
     */
    readonly config: IFluidCodeDetailsConfig;
}

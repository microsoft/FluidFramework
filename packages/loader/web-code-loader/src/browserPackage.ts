/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidPackage, IFluidPackageEnvironment, isFluidPackage } from "@fluidframework/container-definitions";

/**
 * A specific Fluid package environment for browsers
 */
export interface IFluidBrowserPackageEnvironment extends IFluidPackageEnvironment{
    /**
     * The umd target specifics the scripts necessary for loading a packages
     * in a browser environment
     */
    umd: {
        /**
         * The bundled js files for loading this package
         */
        files: string[];

        /**
         * The global name that the script entry points will be exposed.
         * This entry point should be an IFluidModule
         */
        library: string;
    },
}

/**
 * A Fluid package for specification for browser environments
 */
export interface IFluidBrowserPackage extends IFluidPackage {
    /**
     * @inheritdoc
     */
    fluid: {
        /**
         * The browser specific package information for this package
         */
        browser: IFluidBrowserPackageEnvironment;
        /**
         * @inheritdoc
         */
        [environment: string]: IFluidPackageEnvironment;
    }
}

/**
 * Determines if any object is an IFluidBrowserPackage
 * @param maybePkg - The object to check for compatibility with IFluidBrowserPackage
 */
export const isFluidBrowserPackage = (maybePkg: any): maybePkg is Readonly<IFluidBrowserPackage>  =>
    isFluidPackage(maybePkg)
    && typeof maybePkg?.fluid?.browser?.umd?.library === "string"
    && Array.isArray(maybePkg?.fluid?.browser?.umd?.files);

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidPackage, IFluidPackageEnvironment } from "@fluidframework/core-interfaces";
/**
 * A specific Fluid package environment for browsers
 */
export interface IFluidBrowserPackageEnvironment extends IFluidPackageEnvironment {
    /**
     * The Universal Module Definition (umd) target specifics the scripts necessary for
     *  loading a packages in a browser environment and finding its entry point
     */
    umd: {
        /**
         * The bundled js files for loading this package. These files will be loaded
         * and executed in order
         */
        files: string[];
        /**
         * The global name that the script entry points will be exposed.
         * This entry point should be an IFluidModule
         */
        library: string;
    };
}
/**
 * A Fluid package for specification for browser environments
 */
export interface IFluidBrowserPackage extends IFluidPackage {
    /**
     * {@inheritDoc @fluidframework/core-interfaces#IFluidPackage.fluid}
     */
    fluid: {
        /**
         * The browser specific package information for this package
         */
        browser: IFluidBrowserPackageEnvironment;
        /**
         * {@inheritDoc @fluidframework/core-interfaces#IFluidPackage.fluid.environment}
         */
        [environment: string]: IFluidPackageEnvironment;
    };
}
/**
 * Determines if any object is an IFluidBrowserPackage
 * @param maybePkg - The object to check for compatibility with IFluidBrowserPackage
 */
export declare const isFluidBrowserPackage: (maybePkg: any) => maybePkg is Readonly<IFluidBrowserPackage>;
//# sourceMappingURL=browserPackage.d.ts.map
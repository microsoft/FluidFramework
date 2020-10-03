/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidPackage, IFluidPackageEnvironment, isFluidPackage } from "@fluidframework/container-definitions";

export interface IFluidBrowserPackageEnvironment extends IFluidPackageEnvironment{
    umd: {
        // for the umd target, these would be the bundled js files
        files: string[];

        // For umd library is the global name that the script entry points will be exposed
        library: string;
    },
}

export interface IFluidBrowserPackage extends IFluidPackage {
    fluid: {
        browser: IFluidBrowserPackageEnvironment
        [environment: string]: IFluidPackageEnvironment;
    }
}

export const isFluidBrowserPackage = (pkg: any): pkg is Readonly<IFluidBrowserPackage>  =>
    isFluidPackage(pkg)
    && typeof pkg?.fluid?.browser?.umd?.library === "string"
    && Array.isArray(pkg?.fluid?.browser?.umd?.files);

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidCodeDetails } from "./fluidPackage";

export const ICompatibilityChecker: keyof IProvideCompatibilityChecker = "ICompatibilityChecker";

export interface IProvideCompatibilityChecker {
    readonly ICompatibilityChecker: ICompatibilityChecker;
}

export interface ICompatibilityChecker extends IProvideCompatibilityChecker {

    isCompatible(codeDetails: IFluidCodeDetails, codeDetails2: IFluidCodeDetails): Promise<boolean>
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export const ICompatibilityChecker: keyof IProvideCompatibilityChecker = "ICompatibilityChecker";

export interface IProvideCompatibilityChecker {
    readonly ICompatibilityChecker: ICompatibilityChecker;
}

export interface ICompatibilityChecker extends IProvideCompatibilityChecker {

    isCompatible(codeDetails: unknown, codeDetails2: unknown): Promise<boolean>
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidCodeDetails } from "@fluidframework/container-definitions";

export const IDocumentFactory: keyof IProvideDocumentFactory = "IDocumentFactory";

export interface IProvideDocumentFactory {
    readonly IDocumentFactory: IDocumentFactory;
}

export interface IDocumentFactory extends IProvideDocumentFactory {
    create(fluidCodeDetails: IFluidCodeDetails): Promise<string>;
}

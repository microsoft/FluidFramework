/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidCodeDetails } from "@fluidframework/core-interfaces";

export const IDocumentFactory: keyof IProvideDocumentFactory = "IDocumentFactory";

export interface IProvideDocumentFactory {
    readonly IDocumentFactory: IDocumentFactory;
}

export interface IDocumentFactory extends IProvideDocumentFactory {
    create(fluidCodeDetails: IFluidCodeDetails): Promise<string>;
}

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideDocumentFactory>> { }
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideDocumentFactory>> { }
}

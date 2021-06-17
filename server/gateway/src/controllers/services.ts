/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* TODO: @fluid-example packages are not published. Duplicate the interface here for now */
// import { IProvideDocumentFactory } from "@fluid-example/host-service-interfaces";

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

/**
 * Host services provides a collection of interfaces exposed by a gateway host
 */
/* eslint-disable @typescript-eslint/no-empty-interface */
export interface IHostServices extends Partial<
    IProvideDocumentFactory> {
}
/* eslint-enable @typescript-eslint/no-empty-interface */

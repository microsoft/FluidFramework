/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidCodeDetails } from "@prague/container-definitions";

export interface IProvideDocumentFactory {
    readonly IDocumentFactory: IDocumentFactory;
}

export interface IDocumentFactory extends IProvideDocumentFactory {
    create(chaincode: IFluidCodeDetails): Promise<string>;
}

declare module "@prague/component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideDocumentFactory>> {
    }
}

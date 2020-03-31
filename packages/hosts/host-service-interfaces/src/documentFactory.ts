/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";

export const IDocumentFactory = "IDocumentFactory";

export interface IProvideDocumentFactory {
    readonly [IDocumentFactory]: IDocumentFactory;
}

export interface IDocumentFactory extends IProvideDocumentFactory {
    create(chaincode: IFluidCodeDetails): Promise<string>;
}

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideDocumentFactory>> { }
}

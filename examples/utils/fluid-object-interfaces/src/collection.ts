/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidObject } from "@fluidframework/core-interfaces";

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideFluidObjectCollection>> { }
}

export const IFluidObjectCollection: keyof IProvideFluidObjectCollection = "IFluidObjectCollection";

export interface IProvideFluidObjectCollection {
    readonly IFluidObjectCollection: IFluidObjectCollection;
}

/**
 * A data store that implements a collection of Fluid objects.  Typically, the
 * fluid objects in the collection would be like-typed.
 */
export interface IFluidObjectCollection extends IProvideFluidObjectCollection {
    createCollectionItem<TOpt = Record<string, unknown>>(options?: TOpt): IFluidObject;
    removeCollectionItem(instance: IFluidObject): void;
    // Need iteration
}

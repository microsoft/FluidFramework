/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidObject } from "@fluidframework/core-interfaces";

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideFluidObjectCollection>> { }
}

/**
 * @deprecated This example will be removed in a future release.
 */
export const IFluidObjectCollection: keyof IProvideFluidObjectCollection = "IFluidObjectCollection";

/**
 * @deprecated This example will be removed in a future release.
 */
export interface IProvideFluidObjectCollection {
    /**
     * @deprecated This example will be removed in a future release.
     */
    readonly IFluidObjectCollection: IFluidObjectCollection;
}

/**
 * A data store that implements a collection of Fluid objects.  Typically, the
 * fluid objects in the collection would be like-typed.
 * @deprecated This example will be removed in a future release.
 */
export interface IFluidObjectCollection extends IProvideFluidObjectCollection {
    /**
     * @deprecated This example will be removed in a future release.
     */
    createCollectionItem<TOpt = Record<string, unknown>>(options?: TOpt): IFluidObject;

    /**
     * @deprecated This example will be removed in a future release.
     */
    removeCollectionItem(instance: IFluidObject): void;
    // Need iteration
}

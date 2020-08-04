/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidObject } from "@fluidframework/component-core-interfaces";

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideFluidObjectCollection>> { }
}

export const IFluidObjectCollection: keyof IProvideFluidObjectCollection = "IFluidObjectCollection";

export interface IProvideFluidObjectCollection {
    readonly IFluidObjectCollection: IFluidObjectCollection;
}

/**
 * A component that implements a collection of components.  Typically, the
 * components in the collection would be like-typed.
 */
export interface IFluidObjectCollection extends IProvideFluidObjectCollection {
    createCollectionItem<TOpt = object>(options?: TOpt): IFluidObject;
    removeCollectionItem(instance: IFluidObject): void;
    // Need iteration
}

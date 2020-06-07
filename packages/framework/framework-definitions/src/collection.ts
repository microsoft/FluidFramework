/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@fluidframework/component-core-interfaces";

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentCollection>> { }
}

export const IComponentCollection: keyof IProvideComponentCollection = "IComponentCollection";

export interface IProvideComponentCollection {
    readonly IComponentCollection: IComponentCollection;
}

/**
 * A component that implements a collection of components.  Typically, the
 * components in the collection would be like-typed.
 */
export interface IComponentCollection extends IProvideComponentCollection {
    createCollectionItem<TOpt = object>(options?: TOpt): IComponent;
    removeCollectionItem(instance: IComponent): void;
    // Need iteration
}

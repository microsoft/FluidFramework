/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@prague/component-core-interfaces";

declare module "@prague/component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideComponentCollection>> {
    }
}

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
    // need iteration
}

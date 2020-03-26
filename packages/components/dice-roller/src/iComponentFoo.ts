/* eslint-disable @typescript-eslint/semi */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

////
// Declare our new interface
////

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentFoo>> { }
}

export interface IProvideComponentFoo {
    IComponentFoo: IComponentFoo;
}

export interface IComponentFoo extends IProvideComponentFoo {
    foo(): void;
}

export const IComponentFoo_SYMBOL = Symbol.for("IComponentFoo");

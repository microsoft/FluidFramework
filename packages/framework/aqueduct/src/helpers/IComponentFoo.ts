/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentFoo>> { }
}

export const IComponentFoo: keyof IProvideComponentFoo = "IComponentFoo";

export interface IProvideComponentFoo {
    IComponentFoo: IComponentFoo;
}

export interface IComponentFoo extends IProvideComponentFoo {
    foo(): void;
}

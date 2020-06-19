/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentDefaultFactoryName>> { }
}

export const IComponentDefaultFactoryName: keyof IProvideComponentDefaultFactoryName = "IComponentDefaultFactoryName";

export interface IProvideComponentDefaultFactoryName {
    readonly IComponentDefaultFactoryName: IComponentDefaultFactoryName;
}

export interface IComponentDefaultFactoryName extends IProvideComponentDefaultFactoryName {
    getDefaultFactoryName(): string;
}

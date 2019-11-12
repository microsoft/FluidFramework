/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@microsoft/fluid-component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideComponentDefaultFactoryName>> {}
}

export interface IProvideComponentDefaultFactoryName {
    readonly IComponentDefaultFactoryName: IComponentDefaultFactoryName;
}

export interface IComponentDefaultFactoryName extends IProvideComponentDefaultFactoryName {
    getDefaultFactoryName(): string;
}

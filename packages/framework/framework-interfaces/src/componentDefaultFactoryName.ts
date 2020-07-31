/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideFluidExportDefaultFactoryName>> { }
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideFluidExportDefaultFactoryName>> { }
}

export const IFluidExportDefaultFactoryName: keyof IProvideFluidExportDefaultFactoryName =
    "IFluidExportDefaultFactoryName";

export interface IProvideFluidExportDefaultFactoryName {
    readonly IFluidExportDefaultFactoryName: IFluidExportDefaultFactoryName;
}

export interface IFluidExportDefaultFactoryName extends IProvideFluidExportDefaultFactoryName {
    getDefaultFactoryName(): string;
}

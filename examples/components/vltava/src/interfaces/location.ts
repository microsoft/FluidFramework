/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentLocationData>> { }
}

export interface IProvideComponentLocationData {
    readonly IComponentLocationData: IComponentLocationData;
}

export interface ILocationData {
    x: number,
    y: number,
}


// Note: IComponentHandle is required if you want the other person to be able to get a handle to your data
export interface IComponentLocationData extends IProvideComponentLocationData {
    getLocations(): Iterable<ILocationData>;
}

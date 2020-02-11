/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentEventData>> { }
}

export interface IProvideComponentEventData {
    readonly IComponentEventData: IComponentEventData;
}

export interface IEventData {
    allDay?: boolean;
    title?: string;
    start?: Date;
    end?: Date;
    resource?: any;
}


// Note: IComponentHandle is required if you want the other person to be able to get a handle to your data
export interface IComponentEventData extends IProvideComponentEventData {
    event: IEventData;

    on(event: "changed", listener: (newEvent: IEventData) => void): this;
}

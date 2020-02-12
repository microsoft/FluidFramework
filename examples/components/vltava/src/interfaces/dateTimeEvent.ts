/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentDateTimeEvent>> { }
}

export interface IProvideComponentDateTimeEvent {
    readonly IComponentDateTimeEvent: IComponentDateTimeEvent;
}

export interface IDateTimeEvent {
    allDay?: boolean;
    title?: string;
    start?: string;
    end?: string;
    resource?: any;
}


// Note: IComponentHandle is required if you want the other person to be able to get a handle to your data
export interface IComponentDateTimeEvent extends IProvideComponentDateTimeEvent {
    event: IDateTimeEvent;

    on(event: "changed", listener: (newEvent: IDateTimeEvent) => void): this;
}

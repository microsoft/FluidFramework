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
    readonly allDay: boolean;
    readonly title: string;
    readonly start: string;
    readonly end: string;
    readonly resource: any;
}

export interface IComponentDateTimeEvent extends IProvideComponentDateTimeEvent {
    readonly event: IDateTimeEvent;

    on(event: "changed", listener: (id: string) => void): this;
}

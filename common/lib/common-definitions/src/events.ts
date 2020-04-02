/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IEvent {
    (event: string | symbol, listener: (...args: any[]) => void);
}

export interface IEventProvider<TEvent extends IEvent> {
    readonly addListener: TEvent;
    readonly on: TEvent;
    readonly once: TEvent;
    readonly prependListener: TEvent;
    readonly prependOnceListener: TEvent;
    readonly removeListener: TEvent;
    readonly off: TEvent;
}

export interface IErrorEvent extends IEvent {
    (event: "error", listener: (message: any) => void);
}

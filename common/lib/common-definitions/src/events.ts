/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IEvent{
    (event: string | symbol, listener: (...args: any[]) => void);
}

export interface IEmitter<TEvent extends IEvent> {
    addListener: TEvent;
    on: TEvent;
    once: TEvent;
    prependListener: TEvent
    prependOnceListener: TEvent
    removeListener: TEvent
    off: TEvent;
}

export interface IErrorEvent extends IEvent {
    (event: "error", listener: (message: any) => void);
}

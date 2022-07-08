/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

// THIS IS MOSTLY COPIED FROM TYPESCRIPT 4.7'S LIB.DOM.D.TS
// This adds typings for the reason param for AbortController.abort and AbortSignal
// It's made optional since Node 14 doesn't support this, but Node 16 and modern browsers do

export declare class AbortController {
    /** Returns the AbortSignal object associated with this object. */
    readonly signal: AbortSignal;
    /** Invoking this method will set this object's AbortSignal's aborted flag and signal to any observers that the associated activity is to be aborted. */
    abort(reason?: any): void;
}

/** A signal object that allows you to communicate with a DOM request (such as a Fetch) and abort it if required via an AbortController object. */
export interface AbortSignal extends EventTarget {
    /** Returns true if this AbortSignal's AbortController has signaled to abort, and false otherwise. */
    readonly aborted: boolean;
    onabort: ((this: AbortSignal, ev: Event) => any) | null;
    readonly reason?: any;
    //* throwIfAborted(): void;
    addEventListener<K extends keyof AbortSignalEventMap>(type: K, listener: (this: AbortSignal, ev: AbortSignalEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof AbortSignalEventMap>(type: K, listener: (this: AbortSignal, ev: AbortSignalEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

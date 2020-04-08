
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { EventEmitter } from "events";
import { IEventProvider, IEvent } from "@microsoft/fluid-common-definitions";


/**
 * Event Emitter helper class the supports emitting typed events
 */
export class TypedEventEmitter<TEvent extends IEvent> extends EventEmitter implements IEventProvider<TEvent> {
    constructor(){
        super();
        // Disable due to false positive (https://github.com/typescript-eslint/typescript-eslint/issues/1866)
        /* eslint-disable @typescript-eslint/unbound-method */
        this.addListener = super.addListener as any as TEvent;
        this.on = super.on as any as TEvent;
        this.once = super.once as any as TEvent;
        this.prependListener = super.prependListener as any as TEvent;
        this.prependOnceListener = super.prependOnceListener as any as TEvent;
        this.removeListener = super.removeListener as any as TEvent;
        this.off = super.off as any as TEvent;
        /* eslint-enable @typescript-eslint/unbound-method */
    }
    readonly addListener: TEvent;
    readonly on: TEvent;
    readonly once: TEvent;
    readonly prependListener: TEvent;
    readonly prependOnceListener: TEvent;
    readonly removeListener: TEvent;
    readonly off: TEvent;
}

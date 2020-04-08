/* eslint-disable max-len */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ITree, ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { IChannel, ISharedObjectServices } from "@microsoft/fluid-runtime-definitions";
import { IErrorEvent, IEvent } from "@microsoft/fluid-common-definitions";

declare module "@microsoft/fluid-container-definitions" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface IComponent extends Readonly<Partial<IProvideSharedObject>> { }
}

export const ISharedObject: keyof IProvideSharedObject = "ISharedObject";

export interface IProvideSharedObject {
    readonly ISharedObject: ISharedObject;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type IEventThisPlaceHolder={thisPlaceHolder: "thisPlaceHolder"};
type ReplaceThisPlaceHolderWithTThis<L extends any[], TThis> =
  L extends any[] ? { [K in keyof L]: L[K] extends IEventThisPlaceHolder ? TThis : L[K] } : never;

export type TransformedEvent<TThis, E, A extends any[]> =
    (event: E, listener: (...args: ReplaceThisPlaceHolderWithTThis<A, TThis>) => void) => TThis;

export type IEventTransformer<TThis, TEvent extends IEvent> =
TEvent extends
{
    (event: infer E0, listener: (...args: infer A0) => void),
    (event: infer E1, listener: (...args: infer A1) => void),
    (event: infer E2, listener: (...args: infer A2) => void),
    (event: infer E3, listener: (...args: infer A3) => void),
    (event: infer E4, listener: (...args: infer A4) => void),
    (event: infer E5, listener: (...args: infer A5) => void),
    (event: infer E6, listener: (...args: infer A6) => void),
    (event: infer E7, listener: (...args: infer A7) => void),
    (event: infer E8, listener: (...args: infer A8) => void),
    (event: infer E9, listener: (...args: infer A9) => void),
}
    ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1> & TransformedEvent<TThis, E2, A2> &
    TransformedEvent<TThis, E3, A3> & TransformedEvent<TThis, E4, A4> & TransformedEvent<TThis, E5, A5> &
    TransformedEvent<TThis, E6, A6> & TransformedEvent<TThis, E7, A7> & TransformedEvent<TThis, E8, A8> &
    TransformedEvent<TThis, E9, A9>
    :TEvent extends
    {
        (event: infer E0, listener: (...args: infer A0) => void),
        (event: infer E1, listener: (...args: infer A1) => void),
        (event: infer E2, listener: (...args: infer A2) => void),
        (event: infer E3, listener: (...args: infer A3) => void),
        (event: infer E4, listener: (...args: infer A4) => void),
        (event: infer E5, listener: (...args: infer A5) => void),
        (event: infer E6, listener: (...args: infer A6) => void),
        (event: infer E7, listener: (...args: infer A7) => void),
        (event: infer E8, listener: (...args: infer A8) => void),
    }
        ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1> & TransformedEvent<TThis, E2, A2> &
        TransformedEvent<TThis, E3, A3> & TransformedEvent<TThis, E4, A4> & TransformedEvent<TThis, E5, A5> &
        TransformedEvent<TThis, E6, A6> & TransformedEvent<TThis, E7, A7> & TransformedEvent<TThis, E8, A8>
        :TEvent extends
        {
            (event: infer E0, listener: (...args: infer A0) => void),
            (event: infer E1, listener: (...args: infer A1) => void),
            (event: infer E2, listener: (...args: infer A2) => void),
            (event: infer E3, listener: (...args: infer A3) => void),
            (event: infer E4, listener: (...args: infer A4) => void),
            (event: infer E5, listener: (...args: infer A5) => void),
            (event: infer E6, listener: (...args: infer A6) => void),
            (event: infer E7, listener: (...args: infer A7) => void),
        }
            ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1> & TransformedEvent<TThis, E2, A2> &
            TransformedEvent<TThis, E3, A3> & TransformedEvent<TThis, E4, A4> & TransformedEvent<TThis, E5, A5> &
            TransformedEvent<TThis, E6, A6> & TransformedEvent<TThis, E7, A7>
            : TEvent extends
            {
                (event: infer E0, listener: (...args: infer A0) => void),
                (event: infer E1, listener: (...args: infer A1) => void),
                (event: infer E2, listener: (...args: infer A2) => void),
                (event: infer E3, listener: (...args: infer A3) => void),
                (event: infer E4, listener: (...args: infer A4) => void),
                (event: infer E5, listener: (...args: infer A5) => void),
                (event: infer E6, listener: (...args: infer A6) => void),
            }
                ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1> & TransformedEvent<TThis, E2, A2> &
                TransformedEvent<TThis, E3, A3> & TransformedEvent<TThis, E4, A4> & TransformedEvent<TThis, E5, A5> &
                TransformedEvent<TThis, E6, A6>
                : TEvent extends
                {
                    (event: infer E0, listener: (...args: infer A0) => void),
                    (event: infer E1, listener: (...args: infer A1) => void),
                    (event: infer E2, listener: (...args: infer A2) => void),
                    (event: infer E3, listener: (...args: infer A3) => void),
                    (event: infer E4, listener: (...args: infer A4) => void),
                    (event: infer E5, listener: (...args: infer A5) => void),
                }
                    ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1> & TransformedEvent<TThis, E2, A2> &
                    TransformedEvent<TThis, E3, A3> & TransformedEvent<TThis, E4, A4> & TransformedEvent<TThis, E5, A5>
                    : TEvent extends
                    {
                        (event: infer E0, listener: (...args: infer A0) => void),
                        (event: infer E1, listener: (...args: infer A1) => void),
                        (event: infer E2, listener: (...args: infer A2) => void),
                        (event: infer E3, listener: (...args: infer A3) => void),
                        (event: infer E4, listener: (...args: infer A4) => void),
                    }
                        ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1> & TransformedEvent<TThis, E2, A2> &
                        TransformedEvent<TThis, E3, A3> & TransformedEvent<TThis, E4, A4>
                        : TEvent extends
                        {
                            (event: infer E0, listener: (...args: infer A0) => void),
                            (event: infer E1, listener: (...args: infer A1) => void),
                            (event: infer E2, listener: (...args: infer A2) => void),
                            (event: infer E3, listener: (...args: infer A3) => void),
                        }
                            ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1> & TransformedEvent<TThis, E2, A2> &
                            TransformedEvent<TThis, E3, A3>
                            : TEvent extends
                            {
                                (event: infer E0, listener: (...args: infer A0) => void),
                                (event: infer E1, listener: (...args: infer A1) => void),
                                (event: infer E2, listener: (...args: infer A2) => void),
                            }
                                ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1> & TransformedEvent<TThis, E2, A2>
                                : TEvent extends
                                {
                                    (event: infer E0, listener: (...args: infer A0) => void),
                                    (event: infer E1, listener: (...args: infer A1) => void),
                                }
                                    ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1>
                                    : TEvent extends
                                    {
                                        (event: infer E0, listener: (...args: infer A0) => void),
                                    }
                                        ? TransformedEvent<TThis, E0, A0>
                                        : never;


export interface IEventProvider<TEvent extends IEvent>{
    readonly on: IEventTransformer<this, TEvent>;
    readonly once: IEventTransformer<this, TEvent>;
    readonly off: IEventTransformer<this, TEvent>;
}

/**
 * Event Emitter helper class the supports emitting typed events
 */

export class TypedEventEmitter<TEvent extends IEvent> extends EventEmitter implements IEventProvider<TEvent> {
    constructor(){
        super();
        this.addListener = super.addListener.bind(this) as  IEventTransformer<this, TEvent>;
        this.on = super.on.bind(this) as  IEventTransformer<this, TEvent>;
        this.once = super.once.bind(this) as  IEventTransformer<this, TEvent>;
        this.prependListener = super.prependListener.bind(this) as  IEventTransformer<this, TEvent>;
        this.prependOnceListener = super.prependOnceListener.bind(this) as  IEventTransformer<this, TEvent>;
        this.removeListener = super.removeListener.bind(this) as  IEventTransformer<this, TEvent>;
        this.off = super.off.bind(this) as  IEventTransformer<this, TEvent>;
    }
    readonly addListener: IEventTransformer<this, TEvent>;
    readonly on: IEventTransformer<this, TEvent>;
    readonly once: IEventTransformer<this, TEvent>;
    readonly prependListener: IEventTransformer<this, TEvent>;
    readonly prependOnceListener: IEventTransformer<this, TEvent>;
    readonly removeListener: IEventTransformer<this, TEvent>;
    readonly off: IEventTransformer<this, TEvent>;
}

export class EventEmitterWithErrorHandling<TEvent extends IErrorEvent = IErrorEvent> extends TypedEventEmitter<TEvent> {
    public emit(event: string | symbol, ...args: any[]): boolean {
        if (event === "error") {
            const anyListeners = super.emit(event, ...args);
            if (!anyListeners) {
                console.error("Nobody is listening for 'error' events");
            }
            return anyListeners;
        }

        let result: boolean;
        try {
            result = super.emit(event, ...args);
        } catch (error) {
            result = this.emit("error", error);
        }
        return result;
    }
}

export interface ISharedObjectEvents extends IErrorEvent  {
    (event: "pre-op" | "op", listener: (op: ISequencedDocumentMessage, local: boolean, target: IEventThisPlaceHolder) => void);
}

/**
 * Base interface for shared objects from which other interfaces derive. Implemented by SharedObject
 */
export interface ISharedObject<TEvent extends ISharedObjectEvents = ISharedObjectEvents>
    extends IProvideSharedObject, IChannel, IEventProvider<TEvent> {
    /**
     * Registers the given shared object to its containing component runtime, causing it to attach once
     * the runtime attaches.
     */
    register(): void;

    /**
     * Returns whether the given shared object is local.
     * @returns True if the given shared object is local
     */
    isLocal(): boolean;

    /**
     * Returns whether the given shared object is registered.
     * @returns True if the given shared object is registered
     */
    isRegistered(): boolean;

    /**
     * Gets a form of the object that can be serialized.
     * @returns A tree representing the snapshot of the shared object
     */
    snapshot(): ITree;

    /**
     * Enables the channel to send and receive ops.
     * @param services - Services to connect to
     */
    connect(services: ISharedObjectServices): void;
}

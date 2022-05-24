/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IEvent {
    // the event emitter polyfill and the node event emitter have different event types:
    // string | symbol vs. string | number
    // so for our typing we'll contrain to string, so we work with both
    (event: string, listener: (...args: any[]) => void);
}

export interface IErrorEvent extends IEvent {
    (event: "error", listener: (message: any) => void);
}

export interface IEventProvider<TEvent extends IEvent> {
    readonly on: IEventTransformer<this, TEvent>;
    readonly once: IEventTransformer<this, TEvent>;
    readonly off: IEventTransformer<this, TEvent>;
}

/**
 * Allow an interface to extend an interfaces that already extends an IEventProvider
 *``` typescript
 * interface AEvents extends IEvent{
 *  (event: "a-event",listener: (a: number)=>void);
 * }
 * interface A extends IEventProvider<AEvents>{
 *  a: object;
 * }
 *
 * interface BEvents extends IEvent{
 *  (event: "b-event",listener: (b: string)=>void);
 * }
 * interface B extends ExtendEventProvider<AEvents, A, BEvents>{
 *  b: boolean;
 * };
 *```
 * interface B will now extend interface A and it's events
 *
 */
export type ExtendEventProvider<
    TBaseEvent extends IEvent,
    TBase extends IEventProvider<TBaseEvent>,
    TEvent extends TBaseEvent> =
        Omit<Omit<Omit<TBase, "on">, "once">, "off"> & IEventProvider<TBaseEvent> & IEventProvider<TEvent>;

// These types handle replaceing IEventThisPlaceHolder with this, so we can
// support polymorphic this. For instance if an event wanted to be:
// (event: "some-event", listener:(target: this)=>void)
//
// it should be writtern as
// (event: "some-event", listener:(target: IEventThisPlaceHolder)=>void)
//
// and IEventThisPlaceHolder will be replaced with this.
// This is all consumers of these types need to know.

// This is the place holder type that should be used instead of this in events
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type IEventThisPlaceHolder = { thisPlaceHolder: "thisPlaceHolder" };

// This does the type replacement by changing types of IEventThisPlaceHolder to TThis
export type ReplaceIEventThisPlaceHolder<L extends any[], TThis> =
    L extends any[] ? { [K in keyof L]: L[K] extends IEventThisPlaceHolder ? TThis : L[K] } : L;

// this transforms the event overload by replacing IEventThisPlaceHolder with TThis in the event listener arguments
// and having the overload return TTHis as well
export type TransformedEvent<TThis, E, A extends any[]> =
    (event: E, listener: (...args: ReplaceIEventThisPlaceHolder<A, TThis>) => void) => TThis;

// This type is a conditional type for transforming all the overloads provides in TEvent.
// Due to limitations of the typescript typing system, we need to handle each number of overload individually.
// It currently supports the max of 15 event overloads which is more than we use anywhere.
// At more than 15 overloads we start to hit TS2589. If we need to move beyond 15 we should evaluate
// using a mapped type pattern like {"event":(listenerArgs)=>void}
//
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
        (event: infer E10, listener: (...args: infer A10) => void),
        (event: infer E11, listener: (...args: infer A11) => void),
        (event: infer E12, listener: (...args: infer A12) => void),
        (event: infer E13, listener: (...args: infer A13) => void),
        (event: infer E14, listener: (...args: infer A14) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1> & TransformedEvent<TThis, E2, A2> &
    TransformedEvent<TThis, E3, A3> & TransformedEvent<TThis, E4, A4> & TransformedEvent<TThis, E5, A5> &
    TransformedEvent<TThis, E6, A6> & TransformedEvent<TThis, E7, A7> & TransformedEvent<TThis, E8, A8> &
    TransformedEvent<TThis, E9, A9> & TransformedEvent<TThis, E10, A10> & TransformedEvent<TThis, E11, A11> &
    TransformedEvent<TThis, E12, A12> & TransformedEvent<TThis, E13, A13> & TransformedEvent<TThis, E14, A14>
    : TEvent extends
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
        (event: infer E10, listener: (...args: infer A10) => void),
        (event: infer E11, listener: (...args: infer A11) => void),
        (event: infer E12, listener: (...args: infer A12) => void),
        (event: infer E13, listener: (...args: infer A13) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1> & TransformedEvent<TThis, E2, A2> &
    TransformedEvent<TThis, E3, A3> & TransformedEvent<TThis, E4, A4> & TransformedEvent<TThis, E5, A5> &
    TransformedEvent<TThis, E6, A6> & TransformedEvent<TThis, E7, A7> & TransformedEvent<TThis, E8, A8> &
    TransformedEvent<TThis, E9, A9> & TransformedEvent<TThis, E10, A10> & TransformedEvent<TThis, E11, A11> &
    TransformedEvent<TThis, E12, A12> & TransformedEvent<TThis, E13, A13>
    : TEvent extends
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
        (event: infer E10, listener: (...args: infer A10) => void),
        (event: infer E11, listener: (...args: infer A11) => void),
        (event: infer E12, listener: (...args: infer A12) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1> & TransformedEvent<TThis, E2, A2> &
    TransformedEvent<TThis, E3, A3> & TransformedEvent<TThis, E4, A4> & TransformedEvent<TThis, E5, A5> &
    TransformedEvent<TThis, E6, A6> & TransformedEvent<TThis, E7, A7> & TransformedEvent<TThis, E8, A8> &
    TransformedEvent<TThis, E9, A9> & TransformedEvent<TThis, E10, A10> & TransformedEvent<TThis, E11, A11> &
    TransformedEvent<TThis, E12, A12>
    : TEvent extends
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
        (event: infer E10, listener: (...args: infer A10) => void),
        (event: infer E11, listener: (...args: infer A11) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1> & TransformedEvent<TThis, E2, A2> &
    TransformedEvent<TThis, E3, A3> & TransformedEvent<TThis, E4, A4> & TransformedEvent<TThis, E5, A5> &
    TransformedEvent<TThis, E6, A6> & TransformedEvent<TThis, E7, A7> & TransformedEvent<TThis, E8, A8> &
    TransformedEvent<TThis, E9, A9> & TransformedEvent<TThis, E10, A10> & TransformedEvent<TThis, E11, A11>
    : TEvent extends
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
        (event: infer E10, listener: (...args: infer A10) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1> & TransformedEvent<TThis, E2, A2> &
    TransformedEvent<TThis, E3, A3> & TransformedEvent<TThis, E4, A4> & TransformedEvent<TThis, E5, A5> &
    TransformedEvent<TThis, E6, A6> & TransformedEvent<TThis, E7, A7> & TransformedEvent<TThis, E8, A8> &
    TransformedEvent<TThis, E9, A9> & TransformedEvent<TThis, E10, A10>
    : TEvent extends
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
        (event: string, listener: (...args: any[]) => void),
    }
    ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1> & TransformedEvent<TThis, E2, A2> &
    TransformedEvent<TThis, E3, A3> & TransformedEvent<TThis, E4, A4> & TransformedEvent<TThis, E5, A5> &
    TransformedEvent<TThis, E6, A6> & TransformedEvent<TThis, E7, A7> & TransformedEvent<TThis, E8, A8> &
    TransformedEvent<TThis, E9, A9>
    : TEvent extends
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
        (event: string, listener: (...args: any[]) => void),
    }
    ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1> & TransformedEvent<TThis, E2, A2> &
    TransformedEvent<TThis, E3, A3> & TransformedEvent<TThis, E4, A4> & TransformedEvent<TThis, E5, A5> &
    TransformedEvent<TThis, E6, A6> & TransformedEvent<TThis, E7, A7> & TransformedEvent<TThis, E8, A8>
    : TEvent extends
    {
        (event: infer E0, listener: (...args: infer A0) => void),
        (event: infer E1, listener: (...args: infer A1) => void),
        (event: infer E2, listener: (...args: infer A2) => void),
        (event: infer E3, listener: (...args: infer A3) => void),
        (event: infer E4, listener: (...args: infer A4) => void),
        (event: infer E5, listener: (...args: infer A5) => void),
        (event: infer E6, listener: (...args: infer A6) => void),
        (event: infer E7, listener: (...args: infer A7) => void),
        (event: string, listener: (...args: any[]) => void),
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
        (event: string, listener: (...args: any[]) => void),
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
        (event: string, listener: (...args: any[]) => void),
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
        (event: string, listener: (...args: any[]) => void),
    }
    ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1> & TransformedEvent<TThis, E2, A2> &
    TransformedEvent<TThis, E3, A3> & TransformedEvent<TThis, E4, A4>
    : TEvent extends
    {
        (event: infer E0, listener: (...args: infer A0) => void),
        (event: infer E1, listener: (...args: infer A1) => void),
        (event: infer E2, listener: (...args: infer A2) => void),
        (event: infer E3, listener: (...args: infer A3) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1> & TransformedEvent<TThis, E2, A2> &
    TransformedEvent<TThis, E3, A3>
    : TEvent extends
    {
        (event: infer E0, listener: (...args: infer A0) => void),
        (event: infer E1, listener: (...args: infer A1) => void),
        (event: infer E2, listener: (...args: infer A2) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1> & TransformedEvent<TThis, E2, A2>
    : TEvent extends
    {
        (event: infer E0, listener: (...args: infer A0) => void),
        (event: infer E1, listener: (...args: infer A1) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? TransformedEvent<TThis, E0, A0> & TransformedEvent<TThis, E1, A1>
    : TEvent extends
    {
        (event: infer E0, listener: (...args: infer A0) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? TransformedEvent<TThis, E0, A0>
    : TransformedEvent<TThis, string, any[]>;

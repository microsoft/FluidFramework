/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IProvideComponentCallable {
    readonly IComponentCallable: IComponentCallable;
}

/**
 * An IComponentCallable is a component that has a roster of functions defined by T that other compnents can use
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IComponentCallable  {
    getComponentCallbacks<T>(): T;
 }


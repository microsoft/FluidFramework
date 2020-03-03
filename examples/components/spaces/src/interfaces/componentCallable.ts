/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IProvideComponentCallable {
    IComponentCallable: IComponentCallable<any>;
}

/**
 * An IComponentCallable is a component that has a roster of functions defined by T that other compnents can use
 */
export interface IComponentCallable<T>  {
    setComponentCallbacks(callbacks: T): void;
}


/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { Templates } from "./componentRegistryDetails";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentCallable>> { }
}

export interface IComponentCallbacks {
    addComponent?(type: string, w?: number, h?: number): void;
    addTemplate?(template: Templates): void;
    saveLayout?(): void;
    toggleEditable?(isEditable?: boolean): void;
}

export const IComponentCallable: keyof IProvideComponentCallable = "IComponentCallable";

// Experimental code, we are looking into seeing how we can use generics to allow components
// to set interfaces to communicate between one another
export interface IProvideComponentCallable {
    readonly IComponentCallable: IComponentCallable<IComponentCallbacks>;
}

/**
 * An IComponentCallable is a component that has a roster of functions defined by T that other components can use
 */
export interface IComponentCallable<T> extends IProvideComponentCallable {
    setComponentCallbacks(callbacks: T): void;
}

export interface IComponentOptions {
    url?: string;
    handle?: IComponentHandle;
    type?: string;
}

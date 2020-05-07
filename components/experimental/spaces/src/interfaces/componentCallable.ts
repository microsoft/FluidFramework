/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
import { ISpacesCollectible } from "./componentCollectorSpaces";
import { Templates } from "..";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentCallable>> { }
}

/**
 * IComponentCallbacks are all callbacks that a toolbar using Spaces might want to have.
 */
export interface IComponentCallbacks {
    addComponent?(type: string): void;
    addItem?(item: ISpacesCollectible): string;
    shouldShowTemplates?(): boolean;
    addTemplate?(template: Templates): void;
    saveLayout?(): void;
    getEditable?(): boolean;
    setEditable?(isEditable?: boolean): void;
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

export type SpacesCompatibleToolbar = IComponent & IComponentLoadable & IComponentCallable<IComponentCallbacks>;

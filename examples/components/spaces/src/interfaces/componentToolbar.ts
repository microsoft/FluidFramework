/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentToolbar>> { }
}

export const IComponentToolbar: keyof IProvideComponentToolbar = "IComponentToolbar";

// Experimental code, we are looking into seeing how we can use generics to allow components
// to set interfaces to communicate between one another
export interface IProvideComponentToolbar {
    readonly IComponentToolbar: IComponentToolbar;
}

/**
 * An IComponentToolbar is a component that has a roster of functions defined by T that other components can use
 */
export interface IComponentToolbar extends IProvideComponentToolbar {
    changeEditState(isEditable: boolean): void;
}

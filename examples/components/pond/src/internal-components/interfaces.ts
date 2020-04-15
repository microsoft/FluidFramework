/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentUserInformation>> { }
}

export const IComponentUserInformation: keyof IProvideComponentUserInformation  = "IComponentUserInformation";

export interface IProvideComponentUserInformation {
    readonly IComponentUserInformation: IComponentUserInformation;
}

/**
 * A component that implements a collection of components.  Typically, the
 * components in the collection would be like-typed.
 */
export interface IComponentUserInformation extends IProvideComponentUserInformation {
    readonly userCount: number;
    readonly getUsers: () => string[];
    // Event emitter for new users
}

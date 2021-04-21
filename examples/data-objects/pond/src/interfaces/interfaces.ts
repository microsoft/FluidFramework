/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideFluidUserInformation>> { }
}

export const IFluidUserInformation: keyof IProvideFluidUserInformation = "IFluidUserInformation";

export interface IProvideFluidUserInformation {
    readonly IFluidUserInformation: IFluidUserInformation;
}

/**
 * A Fluid object that implements a collection of Fluid objects.  Typically, the
 * Fluid objects in the collection would be like-typed.
 */
export interface IFluidUserInformation extends IProvideFluidUserInformation {
    readonly userCount: number;
    readonly getUsers: () => string[];
    on(event: "membersChanged", listener: () => void): this;
}

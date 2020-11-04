/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidLoadable } from "@fluidframework/core-interfaces";

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

export interface IFluidUserInformationLoadable extends IFluidUserInformation, IFluidLoadable {
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@fluidframework/core-interfaces" {
    export interface IFluidObject extends Readonly<Partial<IProvideFluidUserInformation>> {
        /**
         * @deprecated - Use  `FluidObject<IFluidUserInformation>` instead
        */
        readonly IFluidUserInformation?: IFluidUserInformation
     }
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

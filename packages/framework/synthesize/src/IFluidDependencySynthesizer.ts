/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidObject } from "@fluidframework/core-interfaces";
import {
    AsyncFluidObjectProvider,
    FluidObjectSymbolProvider,
    FluidObjectKey,
} from "./types";

declare module "@fluidframework/core-interfaces" {
    export interface IFluidObject {
        /** @deprecated - use `FluidObject<IFluidDependencySynthesizer>` instead */
        readonly IFluidDependencySynthesizer?: IFluidDependencySynthesizer;
    }
}

export const IFluidDependencySynthesizer: keyof IProvideFluidDependencySynthesizer
    = "IFluidDependencySynthesizer";

export interface IProvideFluidDependencySynthesizer {
    IFluidDependencySynthesizer: IFluidDependencySynthesizer;
}

/**
 * IFluidDependencySynthesizer can generate IFluidObjects based on the IProvideFluidObject pattern.
 * It allow for registering providers and uses synthesize to generate a new object with the optional
 * and required types.
 */
export interface IFluidDependencySynthesizer extends IProvideFluidDependencySynthesizer {

    /**
     * synthesize takes optional and required types and returns an object that will fulfill the
     * defined types based off objects that has been previously registered.
     *
     * @param optionalTypes - optional types to be in the Scope object
     * @param requiredTypes - required types that need to be in the Scope object
     */
    synthesize<
        O extends IFluidObject,
        R extends IFluidObject>(
            optionalTypes: FluidObjectSymbolProvider<O>,
            requiredTypes: FluidObjectSymbolProvider<R>,
    ): AsyncFluidObjectProvider<FluidObjectKey<O>, FluidObjectKey<R>>;

    /**
     * Check if a given type is registered
     * @param type - Type to check
     */
    has(type: (keyof IFluidObject)): boolean;
}

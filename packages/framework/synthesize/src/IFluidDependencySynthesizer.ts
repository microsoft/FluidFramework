/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidObject } from "@fluidframework/core-interfaces";
import {
    AsyncFluidObjectProvider,
    FluidObjectSymbolProvider,
    FluidObjectProvider,
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
     * @deprecated - This will only be available on DependencyContainer
     * All the registered types available
     */
    readonly registeredTypes: Iterable<(keyof IFluidObject)>;

    /**
     * @deprecated - This will only be available on DependencyContainer
     * Add a new provider
     * @param type - Name of the Type T being provided
     * @param provider - A provider that will resolve the T correctly when asked
     * @throws - If passing a type that's already registered
     */
    register<T extends keyof IFluidObject>(type: T, provider: FluidObjectProvider<T>): void;

    /**
     * @deprecated - This will only be available on DependencyContainer
     * Remove a provider
     * @param type - Name of the provider to remove
     */
    unregister<T extends keyof IFluidObject>(type: T): void;

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

    /**
     * @deprecated - This will be removed. Use synthesize or has instead
     * Get a provider. undefined if not available.
     * @param type - Type to get
     */
    getProvider<T extends keyof IFluidObject>(type: T): FluidObjectProvider<T> | undefined;
}

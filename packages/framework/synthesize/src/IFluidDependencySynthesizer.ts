/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideFluidDependencyProvider>> { }
}

export const IFluidDependencyProvider: keyof IProvideFluidDependencyProvider
    = "IFluidDependencyProvider";

export interface IProvideFluidDependencyProvider {
    IFluidDependencyProvider: IFluidDependencyProvider;
}

export interface IFluidDependencyProvider {
    /**
     * Check if a given type is registered
     * @param types - Type to check
     */
    has(...types: (keyof IFluidObject)[]): boolean;

    /**
     * Get a provider. undefined if not available.
     * @param type - Type to get
     */
    getProvider<T extends keyof IFluidObject>(type: T): FluidObjectProvider<T> | undefined;
}

/**
 * IFluidDependencySynthesizer can generate IFluidObjects based on the IProvideFluidObject pattern.
 * It allow for registering providers and uses synthesize to generate a new object with the optional
 * and required types.
 */
export interface IFluidDependencySynthesizer extends IFluidDependencyProvider {
    /**
     * All the registered types available
     */
    readonly registeredTypes: Iterable<(keyof IFluidObject)>;

    /**
     * Add a new provider
     * @param type - Name of the Type T being provided
     * @param provider - A provider that will resolve the T correctly when asked
     * @throws - If passing a type that's already registered
     */
    register<T extends keyof IFluidObject>(type: T, provider: FluidObjectProvider<T>): void;

    /**
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
        // eslint-disable-next-line @typescript-eslint/ban-types
        O extends IFluidObject = {},
        // eslint-disable-next-line @typescript-eslint/ban-types
        R extends IFluidObject = {}>(
            optionalTypes: FluidObjectSymbolProvider<O>,
            requiredTypes: FluidObjectSymbolProvider<R>,
    ): AsyncFluidObjectProvider<FluidObjectKey<O>, FluidObjectKey<R>>;

    synthesizeRequired<
        R extends IFluidObject>(
            requiredTypes: FluidObjectSymbolProvider<R>,
    // eslint-disable-next-line @typescript-eslint/ban-types
    ): AsyncFluidObjectProvider<FluidObjectKey<{}>, FluidObjectKey<R>>;
}

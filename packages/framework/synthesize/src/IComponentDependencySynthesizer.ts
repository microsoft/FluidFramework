/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidObject } from "@fluidframework/component-core-interfaces";
import {
    AsyncComponentProvider,
    ComponentSymbolProvider,
    ComponentProvider,
    ComponentKey,
} from "./types";

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideFluidDependencySynthesizer>> { }
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideFluidDependencySynthesizer>> { }
}

export const IFluidDependencySynthesizer: keyof IProvideFluidDependencySynthesizer
    = "IFluidDependencySynthesizer";

export interface IProvideFluidDependencySynthesizer {
    IFluidDependencySynthesizer: IFluidDependencySynthesizer;
}

/**
 * IComponentSynthesizer can generate IFluidObject Objects based on the IProvideComponent pattern.
 * It allow for registering providers and uses synthesize to generate a new object with the optional
 * and required types.
 */
export interface IFluidDependencySynthesizer extends IProvideFluidDependencySynthesizer {
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
    register<T extends keyof IFluidObject>(type: T, provider: ComponentProvider<T>): void;

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
        O extends IFluidObject,
        R extends IFluidObject,>(
            optionalTypes: ComponentSymbolProvider<O>,
            requiredTypes: ComponentSymbolProvider<R>,
    ): AsyncComponentProvider<ComponentKey<O>, ComponentKey<R>>;

    /**
     * Check if a given type is registered
     * @param types - Type to check
     */
    has(...types: (keyof IFluidObject)[]): boolean;

    /**
     * Get a provider. undefined if not available.
     * @param type - Type to get
     */
    getProvider<T extends keyof IFluidObject>(type: T): ComponentProvider<T> | undefined;
}

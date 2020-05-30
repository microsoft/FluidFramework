/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@fluidframework/component-core-interfaces";
import {
    AsyncComponentProvider,
    ComponentSymbolProvider,
    ComponentProvider,
    ComponentKey,
} from "./types";

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentDependencySynthesizer>> { }
}

export const IComponentDependencySynthesizer: keyof IProvideComponentDependencySynthesizer
    = "IComponentDependencySynthesizer";

export interface IProvideComponentDependencySynthesizer {
    IComponentDependencySynthesizer: IComponentDependencySynthesizer;
}

/**
 * IComponentSynthesizer can generate IComponent Objects based on the IProvideComponent pattern.
 * It allow for registering providers and uses synthesize to generate a new object with the optional
 * and required types.
 */
export interface IComponentDependencySynthesizer extends IProvideComponentDependencySynthesizer {
    /**
     * All the registered types available
     */
    readonly registeredTypes: Iterable<(keyof IComponent)>;

    /**
     * Add a new provider
     * @param type - Name of the Type T being provided
     * @param provider - A provider that will resolve the T correctly when asked
     * @throws - If passing a type that's already registered
     */
    register<T extends keyof IComponent>(type: T, provider: ComponentProvider<T>): void;

    /**
     * Remove a provider
     * @param type - Name of the provider to remove
     */
    unregister<T extends keyof IComponent>(type: T): void;

    /**
     * synthesize takes optional and required types and returns an object that will fulfill the
     * defined types based off objects that has been previously registered.
     *
     * @param optionalTypes - optional types to be in the Scope object
     * @param requiredTypes - required types that need to be in the Scope object
     */
    /* eslint-disable @typescript-eslint/indent */
    synthesize<
        O extends IComponent,
        R extends IComponent,>(
            optionalTypes: ComponentSymbolProvider<O>,
            requiredTypes: ComponentSymbolProvider<R>,
    ): AsyncComponentProvider<ComponentKey<O>, ComponentKey<R>>;
    /* eslint-enable @typescript-eslint/indent */

    /**
     * Check if a given type is registered
     * @param types - Type to check
     */
    has(...types: (keyof IComponent)[]): boolean;

    /**
     * Get a provider. undefined if not available.
     * @param type - Type to get
     */
    getProvider<T extends keyof IComponent>(type: T): ComponentProvider<T> | undefined;
}

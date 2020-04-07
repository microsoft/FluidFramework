/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    Scope,
    ComponentSymbolProvider,
    KeyOfIComponent,
} from "./types";

import {
    Provider,
} from "./providers";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentSynthesizer>> { }
}

export const IComponentSynthesizer: keyof IProvideComponentSynthesizer = "IComponentSynthesizer";

export interface IProvideComponentSynthesizer {
    IComponentSynthesizer: IComponentSynthesizer;
}

/**
 * IComponentSynthesizer can generate IComponent Objects based on the IProvideComponent pattern.
 * It allow for registering providers and uses synthesize to genera a new object with the optional
 * and required types.
 */
export interface IComponentSynthesizer extends IProvideComponentSynthesizer {
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
    register<T extends keyof IComponent>(type: T, provider: Provider<T>): void;

    /**
     * Remove a provider
     * @param type - Name of the provider to remove
     * @returns - Module removed if removed or undefined if it was not there.
     */
    unregister<T extends keyof IComponent>(type: T): Provider<T> | undefined;

    /**
     * synthesize takes optional and required types and returns an object that will fulfill the
     * defined types based off objects that has been previously registered.
     *
     * @param optionalTypes - optional types to be in the Scope object
     * @param requiredTypes - required types that need to be in the Scope object
     */
    synthesize<
        O extends IComponent,
        R extends IComponent>(
        optionalTypes: ComponentSymbolProvider<KeyOfIComponent<O>>,
        requiredTypes: ComponentSymbolProvider<KeyOfIComponent<R>>,
    ): Scope<KeyOfIComponent<O>, KeyOfIComponent<R>>;

    /**
     * Check if a given type is registered
     * @param types - Type to check
     */
    has(types: keyof IComponent | (keyof IComponent)[]): boolean;

    /**
     * Get a provider. undefined if not available.
     * @param type - Type to get
     */
    getProvider<T extends keyof IComponent>(type: T): Provider<T> | undefined;
}

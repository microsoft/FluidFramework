/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import {
    Scope,
    StrongOmitEmpty,
} from "./types";
import { IComponentModuleManager } from "./IComponentModuleManager";
import {
    ClassProvider,
    ValueProvider,
    FactoryProvider,
    Provider,
    isValueProvider,
    isClassProvider,
    isFactoryProvider,
} from "./providers";

/**
 * Empty is used to provide safe type checking when the object coming in is an
 * empty object {}. If you use the actual empty object typescript doesn't do the
 * right thing.
 *
 * This should not be used as a real interface for obvious reasons
 */
export interface Empty {
    "": never;
}

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<Empty>> { }
}

/**
 * ModuleManager is similar to a IoC Container.
 */
export class ModuleManager implements IComponentModuleManager {
    private readonly providers = new Map<keyof IComponent, Provider>();

    public get IComponentModuleManager() { return this; }

    public get registeredModules(): Iterable<(keyof IComponent)> {
        return this.providers.keys();
    }

    public constructor(public parent: IComponentModuleManager | undefined = undefined) { }

    /**
     * Add a module to the Manager
     * @param type - Type of module being registered
     * @param provider - An implementation of the type being registered.
     * @throws - If passing a type that's already registered
     */
    public register<T extends IComponent>(
        type: (keyof IComponent & keyof T),
        provider: ClassProvider<T>,
    ): void;
    public register<T extends IComponent>(
        type: (keyof IComponent & keyof T),
        // eslint-disable-next-line @typescript-eslint/unified-signatures
        provider: FactoryProvider<T>,
    ): void;
    public register<T extends IComponent>(
        type: (keyof IComponent & keyof T),
        // eslint-disable-next-line @typescript-eslint/unified-signatures
        provider: ValueProvider<T>,
    ): void;
    public register<T extends IComponent>(
        type: (keyof IComponent & keyof T),
        provider: Provider<T>,
    ): void {
        // Maybe support having an array of modules?
        if (this.has(type)){
            throw new Error(`Attempting to register a module of type ${type} that's already existing`);
        }

        this.providers.set(type, provider);
    }

    /**
     * Remove a module from the Manager
     * @param type - Type of module to be remove
     * @returns - Module removed if any
     */
    public unregister<T extends IComponent>(type: (keyof IComponent & keyof T)): Provider | undefined {
        const module = this.providers.get(type);
        if (module){
            this.providers.delete(type);
        }

        return module;
    }

    /**
     * Resolve takes optional and required types and returns an object that will be primed with the
     * defined types based off objects that has been previously registered with the ModuleManager.
     *
     * Resolution happens first in the child then upwards to the parent.
     *
     * resolve ensure that the corresponding types property match's the keys of the provided type using Record
     *
     * @param optionalTypes - optional types to be in the Scope object
     * @param requiredTypes - required types that need to be in the Scope object
     */
    public resolve<O extends IComponent = Empty, R extends IComponent = Empty>(
        optionalTypes: StrongOmitEmpty<keyof O & keyof IComponent>,
        requiredTypes: StrongOmitEmpty<keyof R & keyof IComponent>,
    ): Scope<O, R> {
        const optionalValues = Object.values(optionalTypes);
        const requiredValues = Object.values(requiredTypes);

        if (optionalValues === [] && requiredValues === []) {
            // There was nothing passed in so we can return
            return {} as any;
        }

        // Ensure there are no shared types
        // Maybe I can just use Omit and do a type check instead
        requiredValues.forEach((r) => {
            if (optionalValues.indexOf(r) > 0) {
                throw new Error(`Type cannot be defined as both optional and required. [Type:${r}]`);
            }
        });

        const s = this.generateRequired<R>(requiredTypes);
        const o = this.generateOptional<O>(optionalTypes);
        return { ...s, ...o };
    }

    public has(types: keyof IComponent | (keyof IComponent)[]): boolean {
        if (Array.isArray(types)) {
            return types.every((type) => {
                return this.providers.has(type);
            });
        }

        return this.providers.has(types);
    }

    public getProvider<T extends IComponent>(type: (keyof IComponent & keyof T)): Provider<T> | undefined {
        // If we have the provider return it
        const provider = this.providers.get(type);
        if (provider) {
            return provider;
        }

        if (this.parent) {
            return this.parent.getProvider(type);
        }

        return undefined;
    }

    private generateRequired<T extends IComponent>(
        types: StrongOmitEmpty<keyof T & keyof IComponent>,
    ) {
        return Object.assign({}, ...Array.from(Object.values(types), (t) => {
            const provider = this.getProvider(t);
            const module = this.resolveProvider(provider);
            if (!module) {
                throw new Error(`Object attempted to be created without required module ${t}`);
            }

            return {[t]: module};
        }));
    }

    private generateOptional<T extends IComponent>(
        types: StrongOmitEmpty<keyof T & keyof IComponent>,
    ) {
        return Object.assign({}, ...Array.from(Object.values(types), (t) => {
            const provider = this.getProvider(t);
            return {[t]: this.resolveProvider(provider)};
        }));
    }

    private resolveProvider<T>(provider: Provider<T> | undefined) {
        if (!provider) {
            return undefined;
        }

        if(isValueProvider(provider)) {
            return provider.value;
        }

        if(isClassProvider(provider)) {
            return new provider.class();
        }

        if(isFactoryProvider(provider)) {
            return provider.factory(this);
        }
    }
}

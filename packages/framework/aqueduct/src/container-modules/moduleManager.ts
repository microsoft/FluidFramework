/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import { Module, Scope } from "./types";
import { IComponentModuleManager } from "./IComponentModuleManager";

/**
 * ModuleManager is similar to a IoC Container.
 */
export class ModuleManager implements IComponentModuleManager {
    private readonly modules = new Map<keyof IComponent, Module<any>>();

    public get IComponentModuleManager() { return this; }

    public get registeredModules(): Iterable<(keyof IComponent)> {
        return this.modules.keys();
    }

    public constructor(public parent: IComponentModuleManager | undefined = undefined) { }

    /**
     * Add a module to the Manager
     * @param type - Type of module being registered
     * @param value - An implementation of the type being registered.
     * @throws - If passing a type that's already registered
     */
    public register<T extends IComponent>(type: (keyof IComponent & keyof T), value: Module<T>): void {
        // Maybe support having an array of modules?
        if (this.has(type)){
            throw new Error(`Attempting to register a module of type ${type} that's already existing`);
        }

        this.modules.set(type, value);
    }

    /**
     * Remove a module from the Manager
     * @param type - Type of module to be remove
     * @returns - Module removed if any
     */
    public unregister<T extends IComponent>(type: (keyof IComponent & keyof T)): Module<T> | undefined {
        const module = this.modules.get(type);
        if (module){
            this.modules.delete(type);
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
    public resolve<O extends IComponent, R extends IComponent = {}>(
        optionalTypes: Record<keyof O & keyof IComponent, keyof O & keyof IComponent>,
        requiredTypes: Record<keyof R & keyof IComponent, keyof R & keyof IComponent>,
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
                return this.modules.has(type);
            });
        }

        return this.modules.has(types);
    }

    public resolveModule<T extends IComponent>(type: (keyof IComponent & keyof T)): Module<T> | undefined {
        // If we have it return it
        const module = this.modules.get(type);
        if (module) {
            return module;
        }

        if (this.parent) {
            return this.parent.resolveModule(type);
        }

        return undefined;
    }

    private generateRequired<T extends IComponent>(
        types: Record<(keyof T & keyof IComponent), keyof IComponent>,
    ) {
        return Object.assign({}, ...Array.from(Object.values(types), (t) => {
            const module = this.resolveModule(t);
            if (!module) {
                throw new Error(`Object attempted to be created without required module ${t}`);
            }

            return ({[t]: module});
        }));
    }

    private generateOptional<T extends IComponent>(
        types: Record<(keyof T & keyof IComponent), keyof IComponent>,
    ) {
        return Object.assign({}, ...Array.from(Object.values(types), (t) => {
            return ({[t]: this.resolveModule(t)});
        }));
    }
}

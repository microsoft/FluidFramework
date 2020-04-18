/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import {
    AsyncComponentProvider,
    ComponentSymbolProvider,
    ComponentProvider,
    ComponentKey,
} from "./types";
import {
    IComponentDependencySynthesizer,
} from "./IComponentDependencySynthesizer";

/**
 * DependencyContainer is similar to a IoC Container. It takes providers and will
 * synthesize an object based on them when requested.
 */
export class DependencyContainer implements IComponentDependencySynthesizer {
    private readonly providers = new Map<keyof IComponent, ComponentProvider<any>>();

    public get IComponentDependencySynthesizer() { return this; }

    /**
     * {@inheritDoc (IComponentDependencySynthesizer:interface).registeredTypes}
     */
    public get registeredTypes(): Iterable<(keyof IComponent)> {
        return this.providers.keys();
    }

    public constructor(public parent: IComponentDependencySynthesizer | undefined = undefined) { }

    /**
     * {@inheritDoc (IComponentDependencySynthesizer:interface).register}
     */
    public register<T extends keyof IComponent>(type: T, provider: ComponentProvider<T>): void {
        if (this.has(type)) {
            throw new Error(`Attempting to register a provider of type ${type} that already exists`);
        }

        this.providers.set(type, provider);
    }

    /**
     * {@inheritDoc (IComponentDependencySynthesizer:interface).unregister}
     */
    public unregister<T extends keyof IComponent>(type: T): void {
        if (this.providers.has(type)) {
            this.providers.delete(type);
        }
    }

    /**
     * {@inheritDoc (IComponentDependencySynthesizer:interface).synthesize}
     */
    public synthesize<
        O extends IComponent,
        R extends IComponent = {}>(
        optionalTypes: ComponentSymbolProvider<O>,
        requiredTypes: ComponentSymbolProvider<R>,
    ): AsyncComponentProvider<ComponentKey<O>,ComponentKey<R>> {
        const optionalValues = Object.values(optionalTypes);
        const requiredValues = Object.values(requiredTypes);

        // There was nothing passed in so we can return
        if (optionalValues === [] && requiredValues === []) {
            return {} as any;
        }

        const required = this.generateRequired<R>(requiredTypes);
        const optional = this.generateOptional<O>(optionalTypes);
        return { ...required, ...optional };
    }

    /**
     * {@inheritDoc (IComponentDependencySynthesizer:interface).has}
     */
    public has(...types: (keyof IComponent)[]): boolean {
        return types.every((type) => {
            return this.providers.has(type);
        });
    }

    /**
     * {@inheritDoc (IComponentDependencySynthesizer:interface).getProvider}
     */
    public getProvider<T extends keyof IComponent>(type: T): ComponentProvider<T> | undefined {
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
        types: ComponentSymbolProvider<T>,
    ) {
        const values: (keyof IComponent)[] = Object.values(types);
        return Object.assign({}, ...Array.from(values, (t) => {
            const provider = this.getProvider(t);
            if (!provider) {
                throw new Error(`Object attempted to be created without registered required provider ${t}`);
            }

            return this.resolveProvider(provider, t);
        }));
    }

    private generateOptional<T extends IComponent>(
        types: ComponentSymbolProvider<T>,
    ) {
        const values: (keyof IComponent)[] = Object.values(types);
        return Object.assign({}, ...Array.from(values, (t) => {
            const provider = this.getProvider(t);
            if (!provider) {
                return { get [t]() { return Promise.resolve(undefined); } };
            }

            return this.resolveProvider(provider, t);
        }));
    }

    private resolveProvider<T extends keyof IComponent>(provider: ComponentProvider<T>, t: keyof IComponent) {
        // The double nested gets are required for lazy loading the provider resolution
        if (typeof provider === "function") {
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const self = this;
            return { get [t]() {
                if (provider && typeof provider === "function") {
                    return Promise.resolve(provider(self)).then((p) => {
                        if (p) {
                            return p[t];
                        }});
                }
            } };
        }

        return { get [t]() {
            if (provider) {
                return Promise.resolve(provider).then((p) => {
                    if (p) {
                        return p[t];
                    }});
            }
        } };
    }
}

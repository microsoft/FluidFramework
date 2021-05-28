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
import {
    IFluidDependencySynthesizer,
} from "./IFluidDependencySynthesizer";

/**
 * DependencyContainer is similar to a IoC Container. It takes providers and will
 * synthesize an object based on them when requested.
 */
export class DependencyContainer implements IFluidDependencySynthesizer {
    private readonly providers = new Map<keyof IFluidObject, FluidObjectProvider<any>>();

    public get IFluidDependencySynthesizer() { return this; }

    /**
     * {@inheritDoc (IFluidDependencySynthesizer:interface).registeredTypes}
     */
    public get registeredTypes(): Iterable<(keyof IFluidObject)> {
        return this.providers.keys();
    }

    public constructor(public parent: IFluidDependencySynthesizer | undefined = undefined) { }

    /**
     * {@inheritDoc (IFluidDependencySynthesizer:interface).register}
     */
    public register<T extends keyof IFluidObject>(type: T, provider: FluidObjectProvider<T>): void {
        if (this.has(type)) {
            throw new Error(`Attempting to register a provider of type ${type} that already exists`);
        }

        this.providers.set(type, provider);
    }

    /**
     * {@inheritDoc (IFluidDependencySynthesizer:interface).unregister}
     */
    public unregister<T extends keyof IFluidObject>(type: T): void {
        if (this.providers.has(type)) {
            this.providers.delete(type);
        }
    }

    /**
     * {@inheritDoc (IFluidDependencySynthesizer:interface).synthesize}
     */
    public synthesize<
        O extends IFluidObject,
        // eslint-disable-next-line @typescript-eslint/ban-types
        R extends IFluidObject = {}>(
            optionalTypes: FluidObjectSymbolProvider<O>,
            requiredTypes: FluidObjectSymbolProvider<R>,
    ): AsyncFluidObjectProvider<FluidObjectKey<O>, FluidObjectKey<R>> {
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
     * {@inheritDoc (IFluidDependencySynthesizer:interface).has}
     */
    public has(...types: (keyof IFluidObject)[]): boolean {
        return types.every((type) => {
            return this.providers.has(type);
        });
    }

    /**
     * {@inheritDoc (IFluidDependencySynthesizer:interface).getProvider}
     */
    public getProvider<T extends keyof IFluidObject>(type: T): FluidObjectProvider<T> | undefined {
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

    private generateRequired<T extends IFluidObject>(
        types: FluidObjectSymbolProvider<T>,
    ) {
        const values: (keyof IFluidObject)[] = Object.values(types);
        return Object.assign({}, ...Array.from(values, (t) => {
            const provider = this.getProvider(t);
            if (!provider) {
                throw new Error(`Object attempted to be created without registered required provider ${t}`);
            }

            return this.resolveProvider(provider, t);
        }));
    }

    private generateOptional<T extends IFluidObject>(
        types: FluidObjectSymbolProvider<T>,
    ) {
        const values: (keyof IFluidObject)[] = Object.values(types);
        return Object.assign({}, ...Array.from(values, (t) => {
            const provider = this.getProvider(t);
            if (!provider) {
                return { get [t]() { return Promise.resolve(undefined); } };
            }

            return this.resolveProvider(provider, t);
        }));
    }

    private resolveProvider<T extends keyof IFluidObject>(provider: FluidObjectProvider<T>, t: keyof IFluidObject) {
        // The double nested gets are required for lazy loading the provider resolution
        if (typeof provider === "function") {
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const self = this;
            return {
                get [t]() {
                    if (provider && typeof provider === "function") {
                        return Promise.resolve(provider(self)).then((p) => {
                            if (p) {
                                return p[t];
                            }
                        });
                    }
                },
            };
        }

        return {
            get [t]() {
                if (provider) {
                    return Promise.resolve(provider).then((p) => {
                        if (p) {
                            return p[t];
                        }
                    });
                }
            },
        };
    }
}

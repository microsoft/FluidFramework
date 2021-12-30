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
    AsyncOptionalFluidObjectProvider,
    AsyncRequiredFluidObjectProvider,
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
    private readonly parents: IFluidDependencySynthesizer[];
    public get IFluidDependencySynthesizer() { return this; }

    /**
     * @deprecated - use has instead
     * {@inheritDoc (IFluidDependencySynthesizer:interface).registeredTypes}
     */
    public get registeredTypes(): Iterable<(keyof IFluidObject)> {
        return this.providers.keys();
    }

    public constructor(... parents: (IFluidDependencySynthesizer | undefined)[]) {
        this.parents = parents.filter((v): v is IFluidDependencySynthesizer => v !== undefined);
    }

    /**
     * {@inheritDoc (IFluidDependencySynthesizer:interface).register}
     */
    public register<T extends keyof IFluidObject>(type: T, provider: FluidObjectProvider<T>): void {
        if (this.providers.has(type)) {
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
        const base: AsyncFluidObjectProvider<FluidObjectKey<O>, FluidObjectKey<R>> = {} as any;
        this.generateRequired<R>(base, requiredTypes);
        this.generateOptional<O>(base, optionalTypes);
        Object.defineProperty(base, IFluidDependencySynthesizer, { get: () => this });
        return base;
    }

    /**
     * {@inheritDoc (IFluidDependencySynthesizer:interface).has}
     * @param excludeParents - If true, exclude checking parent registries
     */
    public has(type: (keyof IFluidObject), excludeParents?: boolean): boolean {
        if (this.providers.has(type)) {
            return true;
        }
        if (excludeParents !== true) {
            return this.parents.some((p: IFluidDependencySynthesizer) => p.has(type));
        }
        return false;
    }

    /**
     * @deprecated - use synthesize or has instead
     *
     * {@inheritDoc (IFluidDependencySynthesizer:interface).getProvider}
     */
    public getProvider<T extends keyof IFluidObject>(type: T): FluidObjectProvider<T> | undefined {
        // If we have the provider return it
        const provider = this.providers.get(type);
        if (provider) {
            return provider;
        }

        for(const parent of this.parents) {
            const p = parent.getProvider(type);
            if (p !== undefined) {
                return p;
            }
        }

        return undefined;
    }

    private generateRequired<T extends IFluidObject>(
        base: AsyncRequiredFluidObjectProvider<FluidObjectKey<T>>,
        types: FluidObjectSymbolProvider<T>,
    ) {
        for(const key of Object.keys(types) as unknown as (keyof IFluidObject)[]) {
            const provider = this.resolveProvider(key);
            if(provider === undefined) {
                throw new Error(`Object attempted to be created without registered required provider ${key}`);
            }
            Object.defineProperty(
                base,
                key,
                provider,
            );
        }
    }

    private generateOptional<T extends IFluidObject>(
        base: AsyncOptionalFluidObjectProvider<FluidObjectKey<T>>,
        types: FluidObjectSymbolProvider<T>,
    ) {
        for(const key of Object.keys(types) as unknown as (keyof IFluidObject)[]) {
            const provider = this.resolveProvider(key);
            if(provider !== undefined) {
                Object.defineProperty(
                    base,
                    key,
                    provider,
                );
            }
        }
    }

    private resolveProvider<T extends keyof IFluidObject>(t: T): PropertyDescriptor | undefined {
        // If we have the provider return it
        const provider = this.providers.get(t);
        if (provider === undefined) {
            for(const parent of this.parents) {
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                const sp = { [t]: t } as FluidObjectSymbolProvider<Pick<IFluidObject, T>>;
                // eslint-disable-next-line @typescript-eslint/ban-types
                const syn = parent.synthesize<Pick<IFluidObject, T>,{}>(
                    sp,
                    {});
                const descriptor = Object.getOwnPropertyDescriptor(syn, t);
                if (descriptor !== undefined) {
                    return descriptor;
                }
            }
            return undefined;
        }

        // The double nested gets are required for lazy loading the provider resolution
        if (typeof provider === "function") {
            return {
                get() {
                    if (provider && typeof provider === "function") {
                        return Promise.resolve(this[IFluidDependencySynthesizer])
                            .then(async (fds): Promise<any> => provider(fds))
                            .then((p) => p?.[t]);
                    }
                },
            };
        }
        return {
                get() {
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

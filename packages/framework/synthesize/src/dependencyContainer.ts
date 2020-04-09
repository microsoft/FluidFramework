/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import {
    ComponentSymbolProvider,
    OptionalComponentProvider,
    RequiredComponentProvider,
} from "./types";
import { IComponentSynthesizer } from "./IComponentSynthesize";
import {
    InstanceProvider,
    ValueProvider,
    FactoryProvider,
    SingletonProvider,
    Provider,
    isInstanceProvider,
    isValueProvider,
    isFactoryProvider,
    isSingletonProvider,
    isLazy,
} from "./providers";

/**
 * DependencyContainer is similar to a IoC Container. It takes providers and will
 * synthesize an object based on them when requested.
 */
export class DependencyContainer implements IComponentSynthesizer {
    private readonly providers = new Map<keyof IComponent, Provider<any>>();
    private readonly singletons = new Map<keyof IComponent, IComponent>();

    public get IComponentSynthesizer() { return this; }

    /**
     * {@inheritDoc (IComponentSynthesizer:interface).registeredTypes}
     */
    public get registeredTypes(): Iterable<(keyof IComponent)> {
        return this.providers.keys();
    }

    public constructor(public parent: IComponentSynthesizer | undefined = undefined) { }

    /**
     * {@inheritDoc (IComponentSynthesizer:interface).register}
     */
    public register<T extends keyof IComponent>(
        type: T,
        provider: InstanceProvider<T> |
        FactoryProvider<T> |
        SingletonProvider<T> |
        ValueProvider<T> |
        Provider<T>,
    ): void {
        if (this.has(type)){
            throw new Error(`Attempting to register a provider of type ${type} that already exists`);
        }

        this.providers.set(type, provider);
    }

    /**
     * {@inheritDoc (IComponentSynthesizer:interface).unregister}
     */
    public unregister<T extends keyof IComponent>(type: T): Provider<T> | undefined {
        const module = this.providers.get(type);
        if (module){
            this.providers.delete(type);
        }

        return module;
    }

    /**
     * {@inheritDoc (IComponentSynthesizer:interface).synthesize}
     */
    public synthesize<
        O extends keyof IComponent,
        R extends keyof IComponent>(
        optionalTypes: ComponentSymbolProvider<O>,
        requiredTypes: ComponentSymbolProvider<R>,
    ): OptionalComponentProvider<O> & RequiredComponentProvider<R> {
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
     * {@inheritDoc (IComponentSynthesizer:interface).has}
     */
    public has(...types: (keyof IComponent)[]): boolean {
        return types.every((type) => {
            return this.providers.has(type);
        });
    }

    /**
     * {@inheritDoc (IComponentSynthesizer:interface).getProvider}
     */
    public getProvider<T extends keyof IComponent>(type: T): Provider<T> | undefined {
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

    private generateRequired<T extends keyof IComponent>(
        types: ComponentSymbolProvider<T>,
    ) {
        const values: (keyof IComponent)[] = Object.values(types);
        return Object.assign({}, ...Array.from(values, (t) => {
            const provider = this.getProvider(t);
            const value = this.resolveProvider(provider, t);
            if (!value) {
                throw new Error(`Object attempted to be created without registered required provider ${t}`);
            }

            // Using a getter enables lazy loading scenarios
            // Returning value[t] is required for the IProvideComponent* pattern to work
            return {get [t](){
                if (!value) {
                    throw new Error(`This should never be hit and is simply used as a type check`);
                }
                return value[t];
            }};
        }));
    }

    private generateOptional<T extends keyof IComponent>(
        types: ComponentSymbolProvider<T>,
    ) {
        const values: (keyof IComponent)[] = Object.values(types);
        return Object.assign({}, ...Array.from(values, (t) => {
            const provider = this.getProvider(t);
            const value = this.resolveProvider(provider, t);

            // Using a getter enables lazy loading scenarios
            // Returning module[t] is required for the IProvideComponent* pattern to work
            return {get [t]() { return value ? value[t] : undefined; }};
        }));
    }

    private resolveProvider<T extends keyof IComponent>(provider: Provider<T> | undefined, t: keyof IComponent) {
        if (!provider) {
            return undefined;
        }

        if(isValueProvider(provider)) {
            return provider.value;
        }

        if(isFactoryProvider(provider)) {
            return provider.factory(this);
        }

        if (isSingletonProvider(provider)) {
            if (isLazy(provider)) {
                const getSingleton = this.getSingleton.bind(this);
                return { get [t]() {
                    const p = provider as SingletonProvider<T>;
                    return getSingleton(t, p);
                }};
            }

            return this.getSingleton(t, provider);
        }

        if(isInstanceProvider(provider)) {
            if(isLazy(provider)){
                return { get [t]() {
                    if (provider && isInstanceProvider(provider)) {
                        return new provider.instance()[t];
                    }
                }};
            }

            return new provider.instance()[t];
        }
    }

    private getSingleton<T extends keyof IComponent>(type: keyof IComponent, provider: SingletonProvider<T>) {
        if(!this.singletons.has(type)) {
            this.singletons.set(type, new provider.singleton()[type]);
        }

        return this.singletons.get(type);
    }
}

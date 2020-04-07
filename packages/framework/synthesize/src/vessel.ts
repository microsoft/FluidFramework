/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import {
    Scope,
    ComponentSymbolProvider,
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
 * Vessel is similar to a IoC Container. It takes providers and will
 * synthesize an object based on them when requested.
 */
export class Vessel implements IComponentSynthesizer {
    private readonly providers = new Map<keyof IComponent, Provider>();
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
    public register<T extends IComponent>(
        type: (keyof IComponent & keyof T),
        provider: InstanceProvider<T>,
    ): void;
    public register<T extends IComponent>(
        type: (keyof IComponent & keyof T),
        // eslint-disable-next-line @typescript-eslint/unified-signatures
        provider: FactoryProvider<T>,
    ): void;
    public register<T extends IComponent>(
        type: (keyof IComponent & keyof T),
        // eslint-disable-next-line @typescript-eslint/unified-signatures
        provider: SingletonProvider<T>,
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
        // TODO: Maybe support having an array of providers?
        if (this.has(type)){
            throw new Error(`Attempting to register a provider of type ${type} that already exists`);
        }

        this.providers.set(type, provider);
    }

    /**
     * {@inheritDoc (IComponentSynthesizer:interface).unregister}
     */
    public unregister<T extends IComponent>(type: (keyof IComponent & keyof T)): Provider | undefined {
        const module = this.providers.get(type);
        if (module){
            this.providers.delete(type);
        }

        return module;
    }

    /**
     * {@inheritDoc (IComponentSynthesizer:interface).synthesize}
     */
    public synthesize<O extends IComponent, R extends IComponent = {}>(
        optionalTypes: ComponentSymbolProvider<O>,
        requiredTypes: ComponentSymbolProvider<R>,
    ): Scope<O, R> {
        const optionalValues = Object.values(optionalTypes ?? {});
        const requiredValues = Object.values(requiredTypes ?? {});

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

    /**
     * {@inheritDoc (IComponentSynthesizer:interface).has}
     */
    public has(types: keyof IComponent | (keyof IComponent)[]): boolean {
        if (Array.isArray(types)) {
            return types.every((type) => {
                return this.providers.has(type);
            });
        }

        return this.providers.has(types);
    }

    /**
     * {@inheritDoc (IComponentSynthesizer:interface).getProvider}
     */
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
        types: ComponentSymbolProvider<T>,
    ) {
        return Object.assign({}, ...Array.from(Object.values(types), (t) => {
            const provider = this.getProvider(t);
            const module = this.resolveProvider(provider, t);
            if (!module) {
                throw new Error(`Object attempted to be created without required module ${t}`);
            }

            // Using a getter enables lazy loading scenarios
            // Returning module[t] is required for the IProvideComponent* pattern to work
            return {get [t](){
                if (!module) {
                    throw new Error(`This should never be hit and is simply used as a type check`);
                }
                return module[t];
            }};
        }));
    }

    private generateOptional<T extends IComponent>(
        types: ComponentSymbolProvider<T>,
    ) {
        return Object.assign({}, ...Array.from(Object.values(types), (t) => {
            const provider = this.getProvider(t);
            const module = this.resolveProvider(provider, t);

            // Using a getter enables lazy loading scenarios
            // Returning module[t] is required for the IProvideComponent* pattern to work
            return {get [t]() { return module ? module[t] : undefined; }};
        }));
    }

    private resolveProvider<T>(provider: Provider<T> | undefined, t: keyof IComponent) {
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
                    return new (provider as InstanceProvider<T>).instance()[t];
                }};
            }

            return new provider.instance()[t];
        }
    }

    private getSingleton<T>(type: keyof IComponent, provider: SingletonProvider<T>) {
        if(!this.singletons.has(type)) {
            this.singletons.set(type, new provider.singleton()[type]);
        }

        return this.singletons.get(type);
    }
}

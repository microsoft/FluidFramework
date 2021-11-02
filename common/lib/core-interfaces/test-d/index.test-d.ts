/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable unicorn/filename-case */
// eslint-disable-next-line import/no-extraneous-dependencies
import {expectError} from "tsd";
import { IFluidLoadable, IProvideFluidLoadable, Provider, ProviderKeys } from "../dist";


declare function getUnknown(): Provider;

declare function useUnknown(params: Provider | undefined): void;

declare function useProvider<T extends Provider>(params: Provider<T> | undefined): void;

declare function useProviderKey<T,TKey extends ProviderKeys<T> = ProviderKeys<T>>(key: TKey): void;

declare function useLoadable(params: Provider<IFluidLoadable> | undefined): void;

// test with provider
{
    const provider: Provider<IProvideFluidLoadable> = getUnknown();
    useUnknown(provider);
    useUnknown(provider.IFluidLoadable);
    useProvider(provider);
    useProvider(provider.IFluidLoadable);
    useLoadable(provider);
    useLoadable(provider.IFluidLoadable);
    expectError(provider.handle);
    provider.IFluidLoadable?.handle;
    const unknown: Provider | undefined = provider.IFluidLoadable;
    useUnknown(unknown);
    useProvider(unknown);
    useProvider<IFluidLoadable>(unknown);
    useLoadable(unknown);
}

// test with interface
{
    const foo: Provider<IFluidLoadable> = getUnknown();
    useUnknown(foo);
    useUnknown(foo.IFluidLoadable);
    useProvider(foo);
    useProvider(foo.IFluidLoadable);
    useLoadable(foo);
    useLoadable(foo.IFluidLoadable);
    expectError(foo.handle);
    foo.IFluidLoadable?.handle;
    const unknown: Provider | undefined = foo.IFluidLoadable;
    useUnknown(unknown);
    useProvider(unknown);
    useProvider<IFluidLoadable>(unknown);
    useLoadable(unknown);
}

// test getting keys
{
    useProviderKey<IFluidLoadable>(IFluidLoadable);
    useProviderKey<IFluidLoadable>(IFluidLoadable);
    const loadableKey: keyof IFluidLoadable = "handle";
    expectError(useProviderKey<IFluidLoadable>(loadableKey));
}

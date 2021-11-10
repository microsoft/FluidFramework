/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable unicorn/filename-case */
// eslint-disable-next-line import/no-extraneous-dependencies
import {expectError} from "tsd";
import { IFluidLoadable, IProvideFluidLoadable, FluidObject, FluidObjectKeys, IFluidObject } from "../dist";


declare function getUnknownFluidObject(): FluidObject;

declare function useUnknownFluidObject(params: FluidObject | undefined): void;

declare function useProvider<T extends FluidObject>(params: FluidObject<T> | undefined): void;

declare function useProviderKey<T,TKey extends FluidObjectKeys<T> = FluidObjectKeys<T>>(key: TKey): void;

declare function useLoadable(params: FluidObject<IFluidLoadable> | undefined): void;

// test implicit conversions between FluidObject and a FluidObject with a provides interface
{
    const provider: FluidObject<IProvideFluidLoadable> = getUnknownFluidObject();
    useUnknownFluidObject(provider);
    useUnknownFluidObject(provider.IFluidLoadable);
    useProvider(provider);
    useProvider(provider.IFluidLoadable);
    useLoadable(provider);
    useLoadable(provider.IFluidLoadable);
    expectError(provider.handle);
    provider.IFluidLoadable?.handle;
    const unknown: FluidObject | undefined = provider.IFluidLoadable;
    useUnknownFluidObject(unknown);
    useProvider(unknown);
    useProvider<IFluidLoadable>(unknown);
    useLoadable(unknown);
}

// test implicit conversions between FluidObject and a FluidObject with a implementation interface
{
    const foo: FluidObject<IFluidLoadable> = getUnknownFluidObject();
    useUnknownFluidObject(foo);
    useUnknownFluidObject(foo.IFluidLoadable);
    useProvider(foo);
    useProvider(foo.IFluidLoadable);
    useLoadable(foo);
    useLoadable(foo.IFluidLoadable);
    expectError(foo.handle);
    foo.IFluidLoadable?.handle;
    const unknown: FluidObject | undefined = foo.IFluidLoadable;
    useUnknownFluidObject(unknown);
    useProvider(unknown);
    useProvider<IFluidLoadable>(unknown);
    useLoadable(unknown);
}

// test getting keys
{
    useProviderKey<IProvideFluidLoadable>(IFluidLoadable);
    useProviderKey<IFluidLoadable>(IFluidLoadable);
    const loadableKey: keyof IFluidLoadable = "handle";
    expectError(useProviderKey<IFluidLoadable>(loadableKey));
}

// test implicit conversions between FluidObject and a FluidObject with a partial provider interface
{

    interface IProvideFoo{
        IFoo: IFoo;
    }
    interface IFoo extends Partial<IProvideFoo>{
        doFoo();
    }

    const foo: FluidObject<IFoo> = getUnknownFluidObject();
    useUnknownFluidObject(foo);
    useUnknownFluidObject(foo.IFoo);
    useProvider(foo);
    useProvider(foo.IFoo);
    foo.IFoo?.doFoo();
    const fooKey: keyof IFoo = "doFoo";
    expectError(useProviderKey<IFoo>(fooKey));
    const unknown: FluidObject | undefined = foo.IFoo;
    useUnknownFluidObject(unknown);
    useProvider(unknown);
    useProvider<IFoo>(unknown);
    useLoadable(unknown);
}

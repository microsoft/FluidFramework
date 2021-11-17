/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable unicorn/filename-case */
// eslint-disable-next-line import/no-extraneous-dependencies
import {expectError} from "tsd";
import { IFluidLoadable, IProvideFluidLoadable, FluidObject, FluidObjectKeys, IFluidObject } from "../dist";


declare function getFluidObject(): FluidObject;

declare function useFluidObject(params: FluidObject | undefined): void;

declare function useProvider<T extends FluidObject>(params: FluidObject<T> | undefined): void;

declare function useProviderKey<T,TKey extends FluidObjectKeys<T> = FluidObjectKeys<T>>(key: TKey): void;

declare function useLoadable(params: FluidObject<IFluidLoadable> | undefined): void;

// test implicit conversions between FluidObject and a FluidObject with a provides interface
{
    const provider: FluidObject<IProvideFluidLoadable> = getFluidObject();
    useFluidObject(provider);
    useFluidObject(provider.IFluidLoadable);
    useProvider(provider);
    useProvider(provider.IFluidLoadable);
    useLoadable(provider);
    useLoadable(provider.IFluidLoadable);
    expectError(provider.handle);
    provider.IFluidLoadable?.handle;
    const unknown: FluidObject | undefined = provider.IFluidLoadable;
    useFluidObject(unknown);
    useProvider(unknown);
    useProvider<IFluidLoadable>(unknown);
    useLoadable(unknown);
}

// test implicit conversions between FluidObject and a FluidObject with a implementation interface
{
    const foo: FluidObject<IFluidLoadable> = getFluidObject();
    useFluidObject(foo);
    useFluidObject(foo.IFluidLoadable);
    useProvider(foo);
    useProvider(foo.IFluidLoadable);
    useLoadable(foo);
    useLoadable(foo.IFluidLoadable);
    expectError(foo.handle);
    foo.IFluidLoadable?.handle;
    const unknown: FluidObject | undefined = foo.IFluidLoadable;
    useFluidObject(unknown);
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

    const foo: FluidObject<IFoo> = getFluidObject();
    useFluidObject(foo);
    useFluidObject(foo.IFoo);
    useProvider(foo);
    useProvider(foo.IFoo);
    foo.IFoo?.doFoo();
    const fooKey: keyof IFoo = "doFoo";
    expectError(useProviderKey<IFoo>(fooKey));
    const unknown: FluidObject | undefined = foo.IFoo;
    useFluidObject(unknown);
    useProvider(unknown);
    useProvider<IFoo>(unknown);
    useLoadable(unknown);
}

// test implicit conversions between FluidObject and IFluidObject for backcompat
declare function getIFluidObject(): IFluidObject;
{
    const fluidObject: FluidObject = getIFluidObject();
    const legacy: IFluidObject = getFluidObject();
    useLoadable(fluidObject)
    useLoadable(legacy)
    useFluidObject(fluidObject);
    useFluidObject(legacy);
    useProvider(legacy);
    useProvider(fluidObject);
    useProvider<IFluidLoadable>(legacy);
    useProvider<IFluidLoadable>(fluidObject);
}

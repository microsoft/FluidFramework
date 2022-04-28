/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidLoadable, IProvideFluidLoadable, FluidObject, FluidObjectKeys, IFluidObject } from "../../";

declare function getFluidObject(): FluidObject;

declare function useFluidObject(params: FluidObject | undefined): void;

declare function useProvider<T extends FluidObject>(params: FluidObject<T> | undefined): void;

declare function useProviderKey<T, TKey extends FluidObjectKeys<T> = FluidObjectKeys<T>>(key: TKey): void;

declare function useLoadable(params: FluidObject<IFluidLoadable> | undefined): void;
declare function getLoadable(): IFluidLoadable;

declare function use(obj: any);
// test implicit conversions between FluidObject and a FluidObject with a provides interface
{
    const provider: FluidObject<IProvideFluidLoadable> = getFluidObject();
    useFluidObject(provider);
    useFluidObject(provider.IFluidLoadable);
    useProvider(provider);
    useProvider(provider.IFluidLoadable);
    useLoadable(provider);
    useLoadable(provider.IFluidLoadable);
    // @ts-expect-error provider shouldn't have any non-provider properties
    use(provider.handle);
    use(provider.IFluidLoadable?.handle);
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
    // @ts-expect-error provider shouldn't have any non-provider properties
    use(foo.handle);
    use(foo.IFluidLoadable?.handle);
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
    // @ts-expect-error provider shouldn't have any non-provider properties
    useProviderKey<IFluidLoadable>(loadableKey);
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
    // @ts-expect-error provider shouldn't have any non-provider properties
    useProviderKey<IFoo>(fooKey);
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
    useLoadable(fluidObject);
    useLoadable(legacy);
    useFluidObject(fluidObject);
    useFluidObject(legacy);
    useProvider(legacy);
    useProvider(fluidObject);
    useProvider<IFluidLoadable>(legacy);
    useProvider<IFluidLoadable>(fluidObject);
}

// validate nested property is FluidObject too
{
    interface IFoo {
        z: { z: { z: boolean } };
      }

    const foo: FluidObject<IFoo> = getFluidObject();
    // @ts-expect-error "Property 'z' does not exist on type 'FluidObject<IFoo>'."
    useProvider(foo.z);
}

// validate provider inheritance
{
    interface IProvideFooParent{
        IFooParent: IFooParent
    }

    interface IFooParent extends Partial<IProvideFooParent>{
        parent();
    }

    interface IFooProvideChild {
        IFooChild: IFooChild
    }

    interface IFooChild extends IFooParent, Partial<IFooProvideChild>{
        child();
    }

    const p: FluidObject<IProvideFooParent> = getFluidObject();
    useProvider(p.IFooParent?.parent());

    const c: FluidObject<IFooProvideChild> = getFluidObject();
    // @ts-expect-error Property 'IFooParent' does not exist on type 'FluidObject<IFooProvideChild>'.
    useProvider(c.IFooParent?.parent());
    useProvider(c.IFooChild?.child());
    useProvider(c.IFooChild?.parent());
    useProvider(c.IFooChild?.IFooParent?.parent());
}

// validate usage as builder
{
    const builder: FluidObject<IFluidLoadable> = {};
    builder.IFluidLoadable = getLoadable();
}

// validate readonly prevents modification
{
    const builder: Readonly<FluidObject<IFluidLoadable>> = {};
    // @ts-expect-error Cannot assign to 'IFluidLoadable' because it is a read-only property.
    builder.IFluidLoadable = getLoadable();
}

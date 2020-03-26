/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-unassigned-import
import "reflect-metadata";

import { Container as IocContainer,  injectable } from "inversify";

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime, ISharedObjectRegistry } from "@microsoft/fluid-component-runtime";
import { ComponentRegistry } from "@microsoft/fluid-container-runtime";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRegistry,
    IComponentRuntime,
    IProvideComponentRegistry,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";

import { SharedIocComponent } from "../components";

// eslint-disable-next-line import/no-internal-modules
import { IComponentFoo } from "../components/sharedIocComponent";

import { TYPES } from "./types";

@injectable()
export class Foo implements IComponentFoo {
    foo() {
        alert("foo");
    }
}

export class SharedIocComponentFactory<T extends SharedIocComponent>
implements IComponentFactory, Partial<IProvideComponentRegistry>  {

    private readonly sharedObjectRegistry: ISharedObjectRegistry;
    private readonly registry: IComponentRegistry | undefined;

    constructor(
        private readonly ctor: new (runtime: IComponentRuntime, context: IComponentContext) => T,
        sharedObjects: readonly ISharedObjectFactory[],
        registryEntries?: NamedComponentRegistryEntries,
        private readonly onDemandInstantiation = true,
    ) {
        if (registryEntries !== undefined) {
            this.registry = new ComponentRegistry(registryEntries);
        }
        this.sharedObjectRegistry = new Map(sharedObjects.map((ext) => [ext.type, ext]));
    }

    public get IComponentFactory() { return this; }

    public get IComponentRegistry() {
        return this.registry;
    }

    /**
     * This is where we do component setup.
     *
     * @param context - component context used to load a component runtime
     */
    public instantiateComponent(context: IComponentContext): void {
        // Create a new runtime for our component
        // The runtime is what Fluid uses to create DDS' and route to your component
        const runtime = ComponentRuntime.load(
            context,
            this.sharedObjectRegistry,
            this.registry,
        );

        const iocContainer = new IocContainer();
        iocContainer.bind<IComponentContext>(TYPES.IComponentContext).toConstantValue(context);
        iocContainer.bind<IComponentRuntime>(TYPES.IComponentRuntime).toConstantValue(runtime);
        iocContainer.bind<IComponentFoo>(TYPES.IComponentFoo).to(Foo);
        iocContainer.bind<T>(TYPES.SharedComponent).to(this.ctor);

        let instanceP: Promise<SharedIocComponent>;
        // For new runtime, we need to force the component instance to be create
        // run the initialization.
        if (!this.onDemandInstantiation || !runtime.existing) {
            // Create a new instance of our component up front
            instanceP = this.instantiateInstance(iocContainer);
        }

        runtime.registerRequestHandler(async (request: IRequest) => {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            if (!instanceP) {
                // Create a new instance of our component on demand
                instanceP = this.instantiateInstance(iocContainer);
            }
            const instance = await instanceP;
            return instance.request(request);
        });
    }

    /**
     * Instantiate and initialize the component object
     * @param runtime - component runtime created for the component context
     * @param context - component context used to load a component runtime
     */
    private async instantiateInstance<T extends SharedIocComponent>(iocContainer: IocContainer) {
        // Create a new instance of our component
        const instance = iocContainer.get<T>(TYPES.SharedComponent);
        await instance.initialize();
        return instance;
    }
}

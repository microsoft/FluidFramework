/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IComponent } from "@fluidframework/component-core-interfaces";
import { ComponentRuntime, ISharedObjectRegistry } from "@fluidframework/component-runtime";
import { ComponentRegistry } from "@fluidframework/container-runtime";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRegistry,
    NamedComponentRegistryEntries,
} from "@fluidframework/runtime-definitions";
import {
    IComponentRuntime,
    IChannelFactory,
} from "@fluidframework/component-runtime-definitions";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { LazyPromise } from "@fluidframework/common-utils";
import { SharedComponent } from "./sharedcomponent";

export class SharedComponentFactory<T extends SharedComponent> implements IComponentFactory {
    public readonly ISharedObjectRegistry: ISharedObjectRegistry;
    public readonly IComponentRegistry: IComponentRegistry | undefined;

    constructor(
        public readonly type: string,
        private readonly ctor: new (context: IComponentContext, runtime: IComponentRuntime, root: ISharedObject) => T,
        public readonly root: IChannelFactory,
        sharedObjects: readonly IChannelFactory[] = [],
        components?: readonly IComponentFactory[],
    ) {
        if (components !== undefined) {
            this.IComponentRegistry = new ComponentRegistry(
                components.map(
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    (factory) => [factory.type!, factory]) as NamedComponentRegistryEntries);
        }

        this.ISharedObjectRegistry = new Map(
            sharedObjects
                .concat(this.root)
                .map((ext) => [ext.type, ext]));
    }

    public get IComponentFactory() { return this; }

    public instantiateComponent(context: IComponentContext): void {
        const runtime = this.createRuntime(context);

        // Note this may synchronously return an instance or a deferred LazyPromise,
        // depending of if a new component is being created or an existing component
        // is being loaded.
        let instance = this.instantiate(context, runtime);

        runtime.registerRequestHandler(async (request: IRequest) => {
            // If the instance has not yet been resolved, await it now.  Once the instance is
            // resolved, we replace the value of `instance` with the resolved component, at which
            // point we begin processing requests synchronously.
            if ("then" in instance) {
                instance = await instance;
            }

            return instance.request(request);
        });
    }

    public async create(parentContext: IComponentContext, props?: any) {
        const { containerRuntime, packagePath } = parentContext;

        const channel = await containerRuntime._createComponentWithProps(packagePath.concat(this.type));
        return (await channel.request({ url: "/" })).value as IComponent;
    }

    private instantiate(context: IComponentContext, runtime: IComponentRuntime) {
        // New component instances are synchronously created.  Loading a previously created
        // component is deferred (via a LazyPromise) until requested by invoking `.then()`.
        return runtime.existing
            ? new LazyPromise(async () => this.load(context, runtime))
            : this.createCore(context, runtime);
    }

    private createCore(context: IComponentContext, runtime: IComponentRuntime, props?: any) {
        const root = runtime.createChannel("root", this.root.type) as ISharedObject;
        const instance = new this.ctor(context, runtime, root);
        instance.create(props);
        root.bindToContext();
        return instance;
    }

    private async load(context: IComponentContext, runtime: IComponentRuntime) {
        const instance = new this.ctor(
            context,
            runtime,
            await runtime.getChannel("root") as ISharedObject);

        await instance.load();
        return instance;
    }

    private createRuntime(context: IComponentContext) {
        return ComponentRuntime.load(
            context,
            this.ISharedObjectRegistry,
            this.IComponentRegistry,
        );
    }
}

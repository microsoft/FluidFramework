/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, RequestUrlEnum } from "@microsoft/fluid-component-core-interfaces";
import {
    IComponentContext,
    IComponentRuntime,
    NamedComponentRegistryEntries,
    IComponentCreator,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { SharedComponent } from "../components";
import { PrimedComponentFactory } from "./primedComponentFactory";

/**
 * This class exists as a templated wrapper around PrimedComponentFactory that provides
 * a way to create a component with a single call.  It exists to allow a gradual transition
 * of its functionality into the consumers of the primed/shared component factories before
 * that functionality becomes default.
 */
export class TypedComponentFactory<T extends IComponent>
    extends PrimedComponentFactory
    implements IComponentCreator<T>
{
    constructor(
        readonly registryName: string,
        ctor: new (runtime: IComponentRuntime, context: IComponentContext) => SharedComponent,
        sharedObjects: readonly ISharedObjectFactory[] = [],
        registryEntries?: NamedComponentRegistryEntries,
        onDemandInstantiation = true,
    ) {
        super(ctor, sharedObjects, registryEntries, onDemandInstantiation);
    }

    public get IComponentCreator(): IComponentCreator<T> {
        return this;
    }

    public async createComponent(context: IComponentContext): Promise<T> {
        const packagePath = await context.composeSubpackagePath(this.registryName);

        const componentRuntime = await context.hostRuntime.createComponentWithRealizationFn(
            packagePath,
            (newContext) => { this.instantiateComponent(newContext); },
        );
        const response = await componentRuntime.request({url: RequestUrlEnum.DefaultComponent});
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error("Failed to create component");
        }

        componentRuntime.attach();
        return response.value as T;
    }
}

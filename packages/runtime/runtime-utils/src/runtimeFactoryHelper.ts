/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";

export abstract class RuntimeFactoryHelper implements IRuntimeFactory {
    public get IRuntimeFactory() { return this; }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        return this.getRuntime(context);
    }

    public async getRuntime(context: IContainerContext, existing?: boolean): Promise<IRuntime> {
        const isLoaded = existing === true || context.existing === true;
        const runtime = await this.preInitialize(context, isLoaded);

        if (isLoaded) {
            await this.instantiateFromExisting(runtime);
        } else {
            await this.instantiateFirstTime(runtime);
        }

        await this.hasInitialized(runtime);
        return runtime;
    }

    public abstract preInitialize(context: IContainerContext, existing: boolean): Promise<IRuntime>;
    public async instantiateFirstTime(runtime: IRuntime): Promise<void> {}
    public async instantiateFromExisting(runtime: IRuntime): Promise<void> {}
    public async hasInitialized(runtime: IRuntime): Promise<void> {}
}

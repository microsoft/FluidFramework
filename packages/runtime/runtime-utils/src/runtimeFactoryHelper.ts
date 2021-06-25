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
    public get stateful(): boolean { return true; }

    public async instantiateRuntime(context: IContainerContext, existing?: boolean): Promise<IRuntime> {
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

    protected abstract preInitialize(context: IContainerContext, existing: boolean): Promise<IRuntime>;
    protected async instantiateFirstTime(runtime: IRuntime): Promise<void> {}
    protected async instantiateFromExisting(runtime: IRuntime): Promise<void> {}
    protected async hasInitialized(runtime: IRuntime): Promise<void> {}
}

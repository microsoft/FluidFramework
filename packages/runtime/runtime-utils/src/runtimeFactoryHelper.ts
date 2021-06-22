/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContainerContext,
    IRuntime,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";

export abstract class RuntimeFactoryHelper<T = IRuntime> implements IRuntimeFactory {
    public async getRuntime(context: IContainerContext, existing?: boolean): Promise<T> {
        const isLoaded = existing === true || context.existing === true;
        const runtime = await this.preInitialize(context, isLoaded);

        if (isLoaded) {
            await this.initializeFromExisting(runtime);
        } else {
            await this.initializeFirstTime(runtime);
        }

        await this.hasInitialized(runtime);
        return runtime;
    }

    public abstract preInitialize(context: IContainerContext, existing: boolean): Promise<T>;
    public async initializeFirstTime(runtime: T): Promise<void> {}
    public async initializeFromExisting(runtime: T): Promise<void> {}
    public async hasInitialized(runtime: T): Promise<void> {}
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// set the base path for all dynamic imports first
// tslint:disable-next-line:no-import-side-effect
import "./publicpath";

import { IContainerContext, IRuntime, IRuntimeFactory } from "@prague/container-definitions";

class FlowScrollFactoryComponent implements IRuntimeFactory {
    public static supportedInterfaces = ["IRuntimeFactory"];

    public get IRuntimeFactory() { return this; }

    public query(id: string): any {
        return FlowScrollFactoryComponent.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return FlowScrollFactoryComponent.supportedInterfaces;
    }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const entry = await import(/* webpackChunkName: "runtime", webpackPreload: true */ "./runtime");
        return entry.instantiateRuntime(context);
    }
}

export const fluidExport = new FlowScrollFactoryComponent();

// TODO included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return fluidExport.instantiateRuntime(context);
}

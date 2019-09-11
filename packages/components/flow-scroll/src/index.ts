/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// set the base path for all dynamic imports first
// tslint:disable-next-line:no-import-side-effect
import "./publicpath";

import { IContainerContext, IRuntime, IRuntimeFactory } from "@prague/container-definitions";

class FlowScrollFactoryComponent implements IRuntimeFactory {
    public get IRuntimeFactory() { return this; }

    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const entry = await import(/* webpackChunkName: "runtime", webpackPreload: true */ "./runtime");
        return entry.fluidExport.instantiateRuntime(context);
    }
}

export const fluidExport = new FlowScrollFactoryComponent();

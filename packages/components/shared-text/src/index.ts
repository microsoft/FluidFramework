/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// set the base path for all dynamic imports first
// tslint:disable-next-line:no-import-side-effect
import "./publicpath";

import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
import * as sharedTextComponent from "./component";

const entryP = import(/* webpackChunkName: "runtime", webpackPreload: true */ "./runtime");

export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    return sharedTextComponent.instantiateComponent(context);
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const entry = await entryP;
    return entry.instantiateRuntime(context);
}

export * from "./utils";

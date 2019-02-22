// set the base path for all dynamic imports first
// import "./publicpath";

import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { IChaincodeComponent } from "@prague/runtime-definitions";
import * as runtime from "./runtime";

// const entryP = import(/* webpackChunkName: "runtime", webpackPreload: true */"./runtime");

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return runtime.instantiateComponent();
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return runtime.instantiateRuntime(context);
}

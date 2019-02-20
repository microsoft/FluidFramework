// set the base path for all dynamic imports first
import "./publicpath";

import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { IChaincodeComponent } from "@prague/runtime-definitions";

const entryP = import(/* webpackChunkName: "runtime", webpackPreload: true */"./runtime");

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    const entry = await entryP;
    return entry.instantiateComponent();
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const entry = await entryP;
    return entry.instantiateRuntime(context);
}

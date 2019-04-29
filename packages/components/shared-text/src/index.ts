// set the base path for all dynamic imports first
// tslint:disable-next-line:no-import-side-effect
import "./publicpath";

import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";

const entryP = import(/* webpackChunkName: "runtime", webpackPreload: true */"./runtime");

export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    const entry = await entryP;
    return entry.instantiateComponent(context);
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const entry = await entryP;
    return entry.instantiateRuntime(context);
}

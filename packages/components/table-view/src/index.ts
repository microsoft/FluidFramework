/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext, IRuntime } from "@prague/container-definitions";

export { tableViewType } from "./runtime";
export { TableView } from "./tableview";

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const entry = await import(/* webpackChunkName: "runtime", webpackPreload: true */ "./runtime");
    return entry.instantiateRuntime(context);
}

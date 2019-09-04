/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TableDocumentType } from "@chaincode/table-document";
import { SimpleModuleInstantiationFactory } from "@prague/aqueduct";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { IComponentContext } from "@prague/runtime-definitions";

export const tableViewType = "@chaincode/table-view";

export const fluidExport = new SimpleModuleInstantiationFactory(
    tableViewType,
    new Map([
        [tableViewType, import("./tableview").then((m) => m.TableView.getFactory())],
        [TableDocumentType, import("@chaincode/table-document").then((m) => m.TableDocument.getFactory())],
    ]),
);

// Included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
      return fluidExport.instantiateRuntime(context);
}

// Included for back compat - can remove in 0.7 once fluidExport is default
export function instantiateComponent(context: IComponentContext): void {
    fluidExport.instantiateComponent(context);
}

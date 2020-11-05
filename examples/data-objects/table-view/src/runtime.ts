/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { FluidDataStoreRegistry } from "@fluidframework/runtime-utils";
import { tableViewType } from "./tableview";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    tableViewType,
    new FluidDataStoreRegistry([
        // eslint-disable-next-line max-len
        [tableViewType, import(/* webpackChunkName: "table-view", webpackPreload: true */ "./tableview").then((m) => m.TableView.getFactory())],
    ]),
);

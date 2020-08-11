/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { DelayLoadingFactoryAdapter } from "@fluidframework/container-runtime";
import { tableViewType } from "./tableview";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    tableViewType,
    [
        new DelayLoadingFactoryAdapter(
            tableViewType,
            import(/* webpackChunkName: "table-view", webpackPreload: true */ "./tableview")
                .then((m) => m.TableView.getFactory()),
        ),
    ],
);

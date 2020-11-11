/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { createDataStoreRegistry, createDataStoreFactory } from "@fluidframework/runtime-utils";
import { IRuntimeFactory } from "@fluidframework/container-definitions";
import { tableViewType } from "./tableview";

const factory = createDataStoreFactory(
    tableViewType,
    // eslint-disable-next-line max-len
    import(/* webpackChunkName: "table-view", webpackPreload: true */ "./tableview").then((m) => m.TableView.getFactory()));

export const fluidExport: IRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
    factory,
    createDataStoreRegistry([
        [factory.type, Promise.resolve(factory)],
    ]),
);

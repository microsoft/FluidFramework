/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createDataStoreFactory } from "@fluidframework/runtime-utils";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IRuntimeFactory } from "@fluidframework/container-definitions";
import { tableViewType } from "./tableview";

const factory = createDataStoreFactory(
    tableViewType,
    // eslint-disable-next-line max-len
    import(/* webpackChunkName: "table-view", webpackPreload: true */ "./tableview").then((m) => m.TableView.getFactory()));

export const fluidExport: IRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
    factory,
    new Map([
        [factory.type, Promise.resolve(factory)],
    ]),
);

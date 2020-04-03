/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { tableViewType } from "./tableview";

export const fluidExport = new SimpleModuleInstantiationFactory(
    tableViewType,
    new Map([
        // eslint-disable-next-line max-len
        [tableViewType, import(/* webpackChunkName: "table-view", webpackPreload: true */ "./tableview").then((m) => m.TableView.getFactory())],
    ]),
);

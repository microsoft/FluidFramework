/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import { createDataStoreFactory } from "@fluidframework/runtime-utils";
import React from "react";
import { TableModel, tableModelType } from "./tableModel";
import { TableView } from "./tableView";

const tableModelFactory = createDataStoreFactory(
    tableModelType,
    // eslint-disable-next-line max-len
    import(/* webpackChunkName: "table-view", webpackPreload: true */ "./tableModel").then((m) => m.TableModel.getFactory()));

const tableViewCallback = (model: TableModel) => React.createElement(TableView, { model });

/**
 * This does setup for the Container. The ContainerViewRuntimeFactory will instantiate a single Fluid object to use
 * as our model (using the factory we provide), and the view callback we provide will pair that model with an
 * appropriate view.
 */
export const fluidExport = new ContainerViewRuntimeFactory(tableModelFactory, tableViewCallback);

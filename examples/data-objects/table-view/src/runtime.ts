/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import { createDataStoreFactory } from "@fluidframework/runtime-utils";
import { TableView, tableViewType, TableViewView } from "./tableview";

const tableViewFactory = createDataStoreFactory(
    tableViewType,
    // eslint-disable-next-line max-len
    import(/* webpackChunkName: "table-view", webpackPreload: true */ "./tableview").then((m) => m.TableView.getFactory()));

const tableViewViewCallback = (model: TableView) => new TableViewView(model);

/**
 * This does setup for the Container. The ContainerViewRuntimeFactory will instantiate a single Fluid object to use
 * as our model (using the factory we provide), and the view callback we provide will pair that model with an
 * appropriate view.
 */
export const fluidExport = new ContainerViewRuntimeFactory(tableViewFactory, tableViewViewCallback);

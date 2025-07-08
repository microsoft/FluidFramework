/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import React from "react";

import { TableDataObject } from "./dataObject.js";
import { TableView } from "./react/index.js";

export const fluidExport = new ContainerViewRuntimeFactory<TableDataObject>(
	TableDataObject.factory,
	(root: TableDataObject) => <TableView tableModel={root} />,
);

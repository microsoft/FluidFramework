/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import React from "react";

import { getDirectLink, TodoTreeDataObject, TodoTreeView } from "./Todo/index.js";

export const fluidExport = new ContainerViewRuntimeFactory<TodoTreeDataObject>(
	TodoTreeDataObject.factory,
	(root: TodoTreeDataObject) => (
		<TodoTreeView todoModel={root} getDirectLink={getDirectLink} />
	),
);

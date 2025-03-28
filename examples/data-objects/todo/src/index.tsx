/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import React from "react";

import { TodoListDataObject, TodoView } from "./Todo/index.js";

const getDirectLink = (itemId: string) => {
	const pathParts = window.location.pathname.split("/");
	const containerName = pathParts[2];

	// NOTE: Normally the logic getting from the url to the container should belong to the app (not the container code).
	// This way the app retains control over its url format (e.g. here, the /doc/containerName path is actually
	// determined by webpack-fluid-loader).  It's entirely possible that an app may even choose not to permit direct
	// linking.
	const urlToContainer = `/doc/${containerName}`;

	// It is, however, appropriate for the container code to define the in-container routing (e.g. /itemId).
	return `${urlToContainer}/${itemId}`;
};

export const fluidExport = new ContainerViewRuntimeFactory<TodoListDataObject>(
	TodoListDataObject.factory,
	(root: TodoListDataObject) => <TodoView todoModel={root} getDirectLink={getDirectLink} />,
);

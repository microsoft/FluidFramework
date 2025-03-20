/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import { DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import * as sequence from "@fluidframework/sequence/legacy";
import React from "react";

import { MonacoRunner } from "./dataObject.js";
import { MonacoView } from "./view.js";

const monacoName = "@fluid-example/monaco";

const componentFactory = new DataObjectFactory(
	monacoName,
	MonacoRunner,
	[sequence.SharedString.getFactory()],
	{},
);

const monacoViewCallback = (model: MonacoRunner): React.ReactElement =>
	React.createElement(MonacoView, { sharedString: model.text });

/**
 * @internal
 */
export const fluidExport = new ContainerViewRuntimeFactory(
	componentFactory,
	monacoViewCallback,
);

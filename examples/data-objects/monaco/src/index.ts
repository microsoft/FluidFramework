/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
// eslint-disable-next-line import-x/no-internal-modules
import { DataObjectFactory } from "@fluidframework/aqueduct/internal";
import * as sequence from "@fluidframework/sequence/legacy";
import React from "react";

import { MonacoRunner } from "./dataObject.js";
import { MonacoView } from "./view.js";

const monacoName = "@fluid-example/monaco";

const componentFactory = new DataObjectFactory({
	type: monacoName,
	ctor: MonacoRunner,
	sharedObjects: [sequence.SharedString.getFactory()],
});

const monacoViewCallback = (model: MonacoRunner): React.ReactElement =>
	React.createElement(MonacoView, { sharedString: model.text });

/**
 * @internal
 */
export const fluidExport = new ContainerViewRuntimeFactory(
	componentFactory,
	monacoViewCallback,
);

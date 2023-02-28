/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";

import React from "react";

import { SharedTextDataObject } from "./dataObject";
import { SharedTextReactView } from "./view";

const sharedTextViewCallback = (sharedTextDataObject: SharedTextDataObject) =>
	React.createElement(SharedTextReactView, { sharedTextDataObject });

export const fluidExport = new ContainerViewRuntimeFactory(
	SharedTextDataObject.factory,
	sharedTextViewCallback,
);

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import { SharedTextDataObject } from "./dataObject";
import { SharedTextView } from "./view";


const sharedTextViewCallback = (sharedTextDataObject: SharedTextDataObject) => new SharedTextView(sharedTextDataObject);

export const fluidExport = new ContainerViewRuntimeFactory(SharedTextDataObject.factory, sharedTextViewCallback);

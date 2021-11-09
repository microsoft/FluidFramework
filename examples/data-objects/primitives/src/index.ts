/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";

import React from "react";

import { DdsCollection, DdsCollectionFactory } from "./model";
import { DdsCollectionView } from "./view";

const ddsCollectionViewCallback =
    (ddsCollection: DdsCollection) => React.createElement(DdsCollectionView, { ddsCollection });

export const fluidExport =
    new ContainerViewRuntimeFactory<DdsCollection>(DdsCollectionFactory, ddsCollectionViewCallback);

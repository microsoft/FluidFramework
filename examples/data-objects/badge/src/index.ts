/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import * as React from "react";
import { IBadgeModel } from "./Badge.types";
import { BadgeClient } from "./BadgeClient";
import { BadgeInstantiationFactory } from "./instantiationFactory";

const badgeViewCallback = (badge: IBadgeModel) => React.createElement(BadgeClient, { model: badge });

export const fluidExport = new ContainerViewRuntimeFactory<IBadgeModel>(BadgeInstantiationFactory, badgeViewCallback);

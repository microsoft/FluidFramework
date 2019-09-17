/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { InjectionToken } from "@angular/core";
import { SharedMap } from "@microsoft/fluid-map";

export const PRAGUE_PATH = new InjectionToken<string>("prague.path");
export const PRAGUE_ROOT = new InjectionToken<SharedMap>("prague.root");

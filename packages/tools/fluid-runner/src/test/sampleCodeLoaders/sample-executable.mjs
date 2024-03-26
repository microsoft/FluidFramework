#!/usr/bin/env node

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fluidRunner } from "../../../lib/fluidRunner.js";
import { fluidExport } from "../../../lib/test/sampleCodeLoaders/sampleCodeLoader.js";

fluidRunner(fluidExport);

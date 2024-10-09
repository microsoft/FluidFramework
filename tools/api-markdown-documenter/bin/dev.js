#!/usr/bin/env -S node --loader ts-node/esm --disable-warning=ExperimentalWarning
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line n/shebang
import { execute } from "@oclif/core";

await execute({ development: true, dir: import.meta.url });

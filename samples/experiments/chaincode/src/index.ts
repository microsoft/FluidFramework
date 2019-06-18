/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { start } from "fabric-shim";
import { Contract } from "./contract";

start(new Contract());

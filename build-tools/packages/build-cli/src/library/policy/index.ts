/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { policyHandlers } from "@fluidframework/build-tools";
import { tsconfigSorter } from "./tsconfig";

const allPolicyHandlers = [...policyHandlers, tsconfigSorter];

export { allPolicyHandlers };

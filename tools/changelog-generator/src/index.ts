/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChangelogFunctions } from "@changesets/types";

import { getReleaseLine } from "./getReleaseLine";
import { getDependencyReleaseLine } from "./getDependencyReleaseLine";

const changelogFunctions: ChangelogFunctions = {
	getReleaseLine,
	getDependencyReleaseLine,
};

// eslint-disable-next-line import/no-default-export
export default changelogFunctions;

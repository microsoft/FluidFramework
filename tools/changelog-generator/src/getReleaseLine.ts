/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChangelogFunctions } from "@changesets/types";
import changelogFunctions from "changesets-format-with-issue-links";

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
const { getReleaseLine } = changelogFunctions as ChangelogFunctions;

export { getReleaseLine };

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { NewChangesetWithCommit, VersionType } from "@changesets/types";
import changelogFunctions from "changesets-format-with-issue-links";

const { getReleaseLine } = changelogFunctions;
// const { getReleaseLine: getReleaseLineBase } = changelogFunctions;

// const getReleaseLine = async (
// 	changeset: NewChangesetWithCommit,
// 	type: VersionType,
// 	userOptions: unknown,
// ): Promise<string> => {
//   return getReleaseLineBase(changeset, type, null);
// };

export { getReleaseLine };
// export { getReleaseLineBase };

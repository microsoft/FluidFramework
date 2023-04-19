import type { ChangelogFunctions } from "@changesets/types";

import { getReleaseLine } from "./getReleaseLine";
import { getDependencyReleaseLine } from "./getDependencyReleaseLine";

const changelogFunctions = {
	getReleaseLine,
	getDependencyReleaseLine,
} as ChangelogFunctions;

export default changelogFunctions;

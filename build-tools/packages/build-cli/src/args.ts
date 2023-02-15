/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Args } from "@oclif/core";

/**
 * A re-usable CLI argument for package or release group names.
 */
export const packageOrReleaseGroupArg = Args.string({
	name: "package_or_release_group",
	required: true,
	description: "The name of a package or a release group.",
});

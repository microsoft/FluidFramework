/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file is only used from within the context of a docker build.
// fluid-build takes dependencies on the structure of the FluidFramework repository.
// The root fluid build config is renamed to fluidBuild.base.config.cjs within the docker container
// and this file is also placed at the FF repository root, hence the relative path setup below.
// This extra config is necessary in the first place as we don't want to copy the entire FF repo into the docker container,
// thus flub needs to have a pared down set of repoPackages.
module.exports = {
	...require("./fluidBuild.base.config.cjs"),
	repoPackages: {
		routerlicious: {
			directory: "server/routerlicious",
		},
	},
};

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This script is executed by pnpm during dependency resolution. We use it to hook into the resolution and check that
 * only a single version of certain dependencies appear in the dependency tree. This ensures, for example, that even
 * transitive server dependencies are of a consistent version.
 *
 * If someone tries to add or upgrade a package that would introduce a second version of one of these packages, the
 * install process will fail.
 *
 * See https://pnpm.io/pnpmfile for more details about how pnpm uses this file.
 */

const enforceSingleVersion = [
  // BEGIN packages in the server release group
  "@fluidframework/gitresources",
  "@fluidframework/protocol-base",
  "@fluidframework/server-kafka-orderer",
  "@fluidframework/server-lambdas",
  "@fluidframework/server-lambdas-driver",
  "@fluidframework/server-local-server",
  "@fluidframework/server-memory-orderer",
  "@fluidframework/server-routerlicious",
  "@fluidframework/server-routerlicious-base",
  "@fluidframework/server-services",
  "@fluidframework/server-services-client",
  "@fluidframework/server-services-core",
  "@fluidframework/server-services-ordering-kafkanode",
  "@fluidframework/server-services-ordering-rdkafka",
  "@fluidframework/server-services-ordering-zookeeper",
  "@fluidframework/server-services-shared",
  "@fluidframework/server-services-telemetry",
  "@fluidframework/server-services-utils",
  "@fluidframework/server-test-utils",
  // END packages in the server release group
];

function afterAllResolved(lockfile, context) {
	context.log(`Checking duplicate packages`);
  // fs.writeFileSync("./lockfile.json", JSON.stringify(lockfile));
	const packagesKeys = Object.keys(lockfile.packages);
	const found = {};

  // Check the resolved packages for matching entries. Record each version of the package for later output.
	for (const p of packagesKeys) {
		for (const pkgToCheck of enforceSingleVersion) {
      const entryPrefix = `/${pkgToCheck}/`;
			if (p.startsWith(entryPrefix)) {
        const ver = p.slice(entryPrefix.length);
				if (found[pkgToCheck]) {
					found[pkgToCheck].push(ver);
				} else {
					found[pkgToCheck] = [ver];
				}
			}
		}
	}

  // Iterate over the packages we found, and raise an error if any had more than a single version.
	let msg = "";
	for (const [pkg, versions] of Object.entries(found)) {
		if (versions !== undefined && versions.length > 1) {
			msg += `${pkg} found ${versions.length} times, but expected 1: ${JSON.stringify(versions)}\n`;
		}
	}
	if (msg) {
    context.log(msg);
		throw new Error(msg);
	}
	return lockfile;
}

module.exports = {
	hooks: {
		afterAllResolved,
	},
};

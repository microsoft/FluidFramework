/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * .pnpmfile.cjs is a pnpm hook file that allows modification of package.json content
 * (in memory) of the packages that are being installed.
 * https://pnpm.io/pnpmfile
 *
 * This implementation is based on https://gist.github.com/dvins/33b8fb52480149d37cdeb98890244c5b.
 * Changes:
 *  - Added support for complete dependency removal (specify null for newVersion)
 *  - Apply stylistic and naming preferences and comment cleanup
 *  - Specify remapPeerDependencies for local needs
 */

//@ts-check

// https://pnpm.io/pnpmfile
// https://github.com/pnpm/pnpm/issues/4214
// https://github.com/pnpm/pnpm/issues/5391

const rootPkg = require("./package.json");

console.log(`Checking for package peerDependency overrides`);

const remapPeerDependencies = [
	// @fluidframework/azure-client 1.x declares a peerDependency on fluid-framework but does not require it.
	// It should have been an optional peer dependency. We just remove it.
	{
		package: "@fluidframework/azure-client",
		packageVersionPrefix: "1.",
		peerDependency: "fluid-framework",
		newVersion: null,
	},
];

function overridesPeerDependencies(pkg) {
	if (!pkg.peerDependencies) {
		return;
	}

	const applicableRemapPeerDependencies = remapPeerDependencies.filter(
		(remap) =>
			remap.package === pkg.name && pkg.version.startsWith(remap.packageVersionPrefix),
	);

	if (applicableRemapPeerDependencies.length === 0) {
		return;
	}

	console.log(`  - Checking ${pkg.name}@${pkg.version}`);
	for (const dep of applicableRemapPeerDependencies) {
		if (dep.peerDependency in pkg.peerDependencies) {
			console.log(
				`    - Overriding ${pkg.name}@${pkg.version} peerDependency ${dep.peerDependency}@${pkg.peerDependencies[dep.peerDependency]}`,
			);

			// First add a new dependency to the package, if defined, and then remove the peer dependency.
			if (dep.newVersion) {
				// This approach has the added advantage that scoped overrides should now work, too.
				pkg.dependencies[dep.peerDependency] = dep.newVersion;
			}
			delete pkg.peerDependencies[dep.peerDependency];

			const newDep = pkg.dependencies[dep.peerDependency];
			console.log(
				newDep
					? `      - Overrode ${pkg.name}@${pkg.version} peerDependency to ${dep.peerDependency}@${newDep} (as full dependency)`
					: `      - Removed ${pkg.name}@${pkg.version} peerDependency`,
			);
		}
	}
}

module.exports = {
	hooks: {
		readPackage(pkg, _context) {
			overridesPeerDependencies(pkg);
			return pkg;
		},
	},
};

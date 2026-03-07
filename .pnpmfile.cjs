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

// Determine the main TypeScript minor version used by the workspace root.
// Aliased typescript packages (e.g. "typescript-5.9": "npm:typescript@~5.9.2") declare the
// same bin names as the real "typescript" package, and the last one installed wins. By stripping
// the bin field from typescript versions whose major.minor doesn't match the workspace root's,
// we ensure only the main "typescript" dependency owns the tsc/tsserver bins.
const rootPkg = require("./package.json");
const mainTsMinor = rootPkg.devDependencies.typescript
	.replace(/[^0-9.]/g, "")
	.split(".")
	.slice(0, 2)
	.join(".");

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

// Only emit the checking banner once.
// And only if engaged. Some pnpm uses expect specific output (like `pnpm list`) and may break if anything is emitted.
let emittedCheckBanner = false;

function overridesPeerDependencies(pkg, context) {
	if (!emittedCheckBanner) {
		context.log(`Checking for package peerDependency overrides`);
		emittedCheckBanner = true;
	}

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

	context.log(`  - Checking ${pkg.name}@${pkg.version}`);
	for (const dep of applicableRemapPeerDependencies) {
		if (dep.peerDependency in pkg.peerDependencies) {
			context.log(
				`    - Overriding ${pkg.name}@${pkg.version} peerDependency ${dep.peerDependency}@${pkg.peerDependencies[dep.peerDependency]}`,
			);

			// First add a new dependency to the package, if defined, and then remove the peer dependency.
			if (dep.newVersion) {
				// This approach has the added advantage that scoped overrides should now work, too.
				pkg.dependencies[dep.peerDependency] = dep.newVersion;
			}
			delete pkg.peerDependencies[dep.peerDependency];

			const newDep = pkg.dependencies[dep.peerDependency];
			context.log(
				newDep
					? `      - Overrode ${pkg.name}@${pkg.version} peerDependency to ${dep.peerDependency}@${newDep} (as full dependency)`
					: `      - Removed ${pkg.name}@${pkg.version} peerDependency`,
			);
		}
	}
}

// Despite logging revealing the expected behavior this does not appear to
// prevent the installation of conflicting typescript versions, and the last
// one installed still wins for the tsc/tsserver bins.
// Likely to prevent bin installation the on disk result must reflect the
// change which can only by patching the package.
function stripNonMainTypescriptBins(pkg, context) {
	if (pkg.name !== "typescript" || !pkg.bin) {
		return;
	}
	const pkgMinor = pkg.version.split(".").slice(0, 2).join(".");
	if (pkgMinor !== mainTsMinor) {
		delete pkg.bin;
		context.log(
			`    - Stripped bin field from ${pkg.name}@${pkg.version} (not main TypeScript version)`,
		);
	} else {
		context.log(
			`    - Keeping bin field from ${pkg.name}@${pkg.version} (main TypeScript version)`,
		);
	}
}

module.exports = {
	hooks: {
		readPackage(pkg, context) {
			overridesPeerDependencies(pkg, context);
			stripNonMainTypescriptBins(pkg, context);
			return pkg;
		},
	},
};

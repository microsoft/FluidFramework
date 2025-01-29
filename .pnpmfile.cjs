//@ts-check

// Based on https://gist.github.com/dvins/33b8fb52480149d37cdeb98890244c5b
// Changes:
//  - Added support for complete dependency removal (specify null for newVersion)
//  - Specify remapPeerDependencies for local needs

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
		packageVersion: "1.",
		peerDependency: "fluid-framework",
		newVersion: null,
	},
];

function overridesPeerDependencies(pkg) {
	if (pkg.peerDependencies) {
		remapPeerDependencies.map((dep) => {
			if (pkg.name === dep.package && pkg.version.startsWith(dep.packageVersion)) {
				console.log(`  - Checking ${pkg.name}@${pkg.version}`); // , pkg.peerDependencies);

				if (dep.peerDependency in pkg.peerDependencies) {
					try {
						console.log(
							`    - Overriding ${pkg.name}@${pkg.version} peerDependency ${dep.peerDependency}@${pkg.peerDependencies[dep.peerDependency]}`,
						);

						// First add a new dependency to the package and then remove the peer dependency, if defined.
						if (dep.newVersion) {
							// This approach has the added advantage that scoped overrides should now work, too.
							pkg.dependencies[dep.peerDependency] = dep.newVersion;
						}
						delete pkg.peerDependencies[dep.peerDependency];

						console.log(
							`      - Overrode ${pkg.name}@${pkg.version} peerDependency ${dep.peerDependency}@${pkg.dependencies[dep.peerDependency]}`,
						);
					} catch (err) {
						console.error(err);
					}
				}
			}
		});
	}
}

module.exports = {
	hooks: {
		readPackage(pkg, _context) {
			// skipDeps(pkg);
			overridesPeerDependencies(pkg);
			return pkg;
		},
	},
};

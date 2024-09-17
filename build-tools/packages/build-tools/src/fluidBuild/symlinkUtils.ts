/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Stats, existsSync } from "node:fs";
import { lstat, mkdir, realpath, rename, symlink, unlink, writeFile } from "node:fs/promises";
import * as path from "node:path";
import * as semver from "semver";

import { defaultLogger } from "../common/logging";
import { MonoRepo } from "../common/monoRepo";
import { Package } from "../common/npmPackage";
import { FluidRepoBuild } from "./fluidRepoBuild";

import registerDebug from "debug";
const traceSymLink = registerDebug("fluid-build:symlink");

const { warning } = defaultLogger;

/**
 * @deprecated symlink-related functionality will be removed in an upcoming release.
 */
async function writeAndReplace(outFile: string, bakFile: string, content: string) {
	traceSymLink(`Writing ${outFile}`);
	if (existsSync(`${outFile}`)) {
		await rename(`${outFile}`, `${bakFile}`);
	}
	return writeFile(`${outFile}`, content);
}

/**
 * @deprecated symlink-related functionality will be removed in an upcoming release.
 */
async function writeBin(dir: string, binName: string, pkgName: string, binPath: string) {
	const outFile = path.normalize(`${dir}/node_modules/.bin/${binName}`);
	const bakFile = path.normalize(`${dir}/node_modules/.bin/_${binName}`);
	if (process.platform === "win32") {
		const winpath = `%~dp0\\..\\${path.normalize(pkgName)}\\${path.normalize(binPath)}`;
		const cmd = `@IF EXIST "%~dp0\\node.exe" (
  "%~dp0\\node.exe"  "${winpath}" %*
) ELSE (
  @SETLOCAL
  @SET PATHEXT=%PATHEXT:;.JS;=;%
  node  "${winpath}" %*
)`;
		await writeAndReplace(`${outFile}.cmd`, `${bakFile}.cmd`, cmd);
	}

	const posixpath = `$basedir/../${path.posix.normalize(pkgName)}/${path.posix.normalize(
		binPath,
	)}`;
	const sh = `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")

case \`uname\` in
    *CYGWIN*) basedir=\`cygpath -w "$basedir"\`;;
esac

if [ -x "$basedir/node" ]; then
  "$basedir/node"  "${posixpath}" "$@"
  ret=$?
else
  node  "${posixpath}" "$@"
  ret=$?
fi
exit $ret`;

	await writeAndReplace(`${outFile}`, `${bakFile}`, sh);
}

/**
 * @deprecated symlink-related functionality will be removed in an upcoming release.
 */
async function revertBin(dir: string, binName: string) {
	const outFile = path.normalize(`${dir}/node_modules/.bin/${binName}`);
	const bakFile = path.normalize(`${dir}/node_modules/.bin/_${binName}`);
	if (process.platform === "win32") {
		if (existsSync(`${bakFile}.cmd`)) {
			await rename(`${bakFile}.cmd`, `${outFile}.cmd`);
		}
	}

	if (existsSync(`${bakFile}`)) {
		await rename(`${bakFile}`, `${outFile}`);
	}
}

/**
 * @deprecated symlink-related functionality will be removed in an upcoming release.
 */
async function fixSymlink(
	stat: Stats | undefined,
	symlinkPath: string,
	pkg: Package,
	depBuildPackage: Package,
) {
	// Fixing the symlink
	traceSymLink(`${pkg.nameColored}: Fixing symlink ${symlinkPath}`);
	if (stat) {
		await rename(
			symlinkPath,
			path.join(path.dirname(symlinkPath), `_${path.basename(symlinkPath)}`),
		);
	} else {
		// Ensure the directory exist
		const symlinkDir = path.join(symlinkPath, "..");
		if (!existsSync(symlinkDir)) {
			await mkdir(symlinkDir, { recursive: true });
		}
	}
	// Create symlink
	await symlink(depBuildPackage.directory, symlinkPath, "junction");

	if (depBuildPackage.packageJson.bin) {
		for (const name of Object.keys(depBuildPackage.packageJson.bin)) {
			await writeBin(
				pkg.directory,
				name,
				depBuildPackage.name,
				depBuildPackage.packageJson.bin[name],
			);
		}
	}
}

async function revertSymlink(symlinkPath: string, pkg: Package, depBuildPackage: Package) {
	await unlink(symlinkPath);
	const origPath = path.join(path.dirname(symlinkPath), `_${path.basename(symlinkPath)}`);
	if (existsSync(origPath)) {
		await rename(origPath, symlinkPath);
		traceSymLink(`${pkg.nameColored}: Reverted symlink ${symlinkPath}`);
	} else {
		traceSymLink(`${pkg.nameColored}: Removed symlink ${symlinkPath}`);
	}

	if (depBuildPackage.packageJson.bin) {
		for (const name of Object.keys(depBuildPackage.packageJson.bin)) {
			await revertBin(pkg.directory, name);
		}
	}
}

/**
 * @deprecated symlink-related functionality will be removed in an upcoming release.
 */
export interface ISymlinkOptions {
	symlink: boolean;
	fullSymlink: boolean | undefined;
}

/**
 * @deprecated symlink-related functionality will be removed in an upcoming release.
 */
export async function symlinkPackage(
	repo: FluidRepoBuild,
	pkg: Package,
	buildPackages: Map<string, Package>,
	options: ISymlinkOptions,
) {
	let count = 0;
	const monoRepoNodeModulePath = pkg.monoRepo?.getNodeModulePath();

	if (monoRepoNodeModulePath && !existsSync(monoRepoNodeModulePath)) {
		// If the node_modules isn't install at all, just don't check
		if (options.symlink) {
			warning(`${pkg.nameColored}: node_modules not installed.  Can't fix symlink.`);
		}
		return { pkg, count };
	}

	for (const { name: dep, version } of pkg.combinedDependencies) {
		const depBuildPackage = buildPackages.get(dep);
		// Check and fix link if it is a known package and version satisfy the version.
		// TODO: check of extraneous symlinks
		if (depBuildPackage) {
			const sameMonoRepo = MonoRepo.isSame(pkg.monoRepo, depBuildPackage.monoRepo);
			const satisfied =
				version.startsWith("workspace:") || semver.satisfies(depBuildPackage.version, version);
			traceSymLink(
				`${pkg.nameColored}: Dependent ${depBuildPackage.nameColored} version ${
					depBuildPackage.version
				} ${satisfied ? "satisfied" : "not satisfied"} by range ${version}`,
			);
			if (!satisfied) {
				if (sameMonoRepo) {
					warning(
						`${pkg.nameColored}: Mismatch version ${depBuildPackage.version} for dependency ${depBuildPackage.nameColored} in the same mono repo`,
					);
				}
				continue;
			}
			const localSymlinkPath = path.join(pkg.directory, "node_modules", dep);
			const monoRepoSymlinkPath = monoRepoNodeModulePath
				? path.join(monoRepoNodeModulePath, dep)
				: undefined;

			try {
				let stat: Stats | undefined;
				let symlinkPath: string | undefined = undefined;
				if (existsSync(localSymlinkPath)) {
					symlinkPath = localSymlinkPath;
				} else if (monoRepoSymlinkPath) {
					if (existsSync(monoRepoSymlinkPath)) {
						symlinkPath = monoRepoSymlinkPath;
					}
				}

				if (symlinkPath) {
					stat = await lstat(symlinkPath);
					if (stat.isSymbolicLink()) {
						const realPath = await realpath(symlinkPath);
						if (realPath === depBuildPackage.directory) {
							// Have the correct symlink, continue
							if (!sameMonoRepo) {
								if (options.fullSymlink === undefined) {
									options.fullSymlink = true;
								} else if (!options.fullSymlink) {
									if (options.symlink) {
										await revertSymlink(symlinkPath, pkg, depBuildPackage);
										count++;
									} else {
										warning(
											`${pkg.nameColored}: warning: dependent package ${depBuildPackage.nameColored} linked. Use --symlink to fix`,
										);
									}
								}
							}
							continue;
						}
						traceSymLink(
							`${pkg.nameColored}: Symlink found ${symlinkPath} @${realPath}, expects ${depBuildPackage.directory}`,
						);
					}
				}

				if (!sameMonoRepo) {
					if (options.fullSymlink === undefined) {
						options.fullSymlink = false;
					}

					if (!options.fullSymlink) {
						continue;
					}
				}

				if (!options.symlink) {
					warning(
						`${pkg.nameColored}: warning: dependent package ${depBuildPackage.nameColored} not linked. Use --symlink or --symlink:full to fix.`,
					);
					continue;
				}

				if (!symlinkPath) {
					symlinkPath = localSymlinkPath;
				}
				await fixSymlink(stat, symlinkPath, pkg, depBuildPackage);
				count++;
			} catch (e) {
				throw new Error(`symlink failed on ${localSymlinkPath}.\n ${e}`);
			}
		}
	}
	return { pkg, count };
}

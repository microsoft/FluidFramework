/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Local type definitions for the subset of @fluid-tools/build-infrastructure types used
 * by fluid-build.
 *
 * build-infrastructure is an ESM-only package and build-tools emits CJS, so static imports
 * are not possible with node16 module resolution. These structural types allow type-safe
 * code without direct module imports. At runtime, the actual objects are loaded via dynamic
 * `import()`.
 */

/**
 * Subset of {@link @fluid-tools/build-infrastructure#IPackage} used by fluid-build.
 */
export interface BuildInfraPackage {
	readonly name: string;
	readonly nameColored: string;
	readonly directory: string;
	readonly version: string;
	readonly private: boolean;
	readonly isWorkspaceRoot: boolean;
	readonly isReleaseGroupRoot: boolean;
	readonly releaseGroup: string;
	readonly packageJsonFilePath: string;
	readonly packageJson: Record<string, unknown>;
	readonly packageManager: { readonly name: string };
	readonly workspace: BuildInfraWorkspace;
	readonly combinedDependencies: Generator<BuildInfraPackageDependency, void>;
	getScript(name: string): string | undefined;
	checkInstall(): Promise<true | string[]>;
	reload(): void;
}

/**
 * Subset of {@link @fluid-tools/build-infrastructure#PackageDependency} used by fluid-build.
 */
export interface BuildInfraPackageDependency {
	name: string;
	version: string;
	depKind: "prod" | "dev" | "peer";
}

/**
 * Subset of {@link @fluid-tools/build-infrastructure#IReleaseGroup} used by fluid-build.
 */
export interface BuildInfraReleaseGroup {
	readonly name: string;
	readonly version: string;
	readonly rootPackage?: BuildInfraPackage;
	readonly packages: BuildInfraPackage[];
	readonly workspace: BuildInfraWorkspace;
}

/**
 * Subset of {@link @fluid-tools/build-infrastructure#IWorkspace} used by fluid-build.
 */
export interface BuildInfraWorkspace {
	readonly name: string;
	readonly directory: string;
	readonly rootPackage: BuildInfraPackage;
	readonly packages: BuildInfraPackage[];
	readonly releaseGroups: Map<string, BuildInfraReleaseGroup>;
	install(updateLockfile: boolean): Promise<boolean>;
}

/**
 * Subset of {@link @fluid-tools/build-infrastructure#IBuildProject} used by fluid-build.
 */
export interface BuildInfraProject {
	readonly root: string;
	readonly workspaces: Map<string, BuildInfraWorkspace>;
	readonly releaseGroups: Map<string, BuildInfraReleaseGroup>;
	readonly packages: Map<string, BuildInfraPackage>;
	relativeToRepo(p: string): string;
}

/**
 * Dynamically imports and calls loadBuildProject from @fluid-tools/build-infrastructure.
 *
 * @param searchPath - The path to search for the build project configuration.
 * @returns The loaded build project.
 */
export async function loadBuildProjectAsync(searchPath: string): Promise<BuildInfraProject> {
	const mod = await import("@fluid-tools/build-infrastructure");
	return (
		mod as unknown as { loadBuildProject: (path: string) => BuildInfraProject }
	).loadBuildProject(searchPath);
}

import registerDebug from "debug";
import { loadFluidBuildConfig } from "./fluidUtils";
import { findGitRootSync } from "./utils";

/**
 * The default name of the fluid-build executable. This is used for identifying fluid-build tasks and for trace log
 * entries.
 */
export const defaultExecutableName = "fluid-build";
const repoRoot = findGitRootSync();
const config = loadFluidBuildConfig(repoRoot);

/**
 *
 */
const FLUID_BUILD_EXE = config.executableNames?.[0] ?? defaultExecutableName;

const allValidFluidBuildExecutableNames =
	config.executableNames === undefined || config.executableNames.length === 0
		? [defaultExecutableName]
		: [...config.executableNames, defaultExecutableName];

export const isFluidBuildScript = (script: string | undefined): boolean => {
	return script === undefined
		? false
		: // Returns true if the script starts with any of the valid executable names
			allValidFluidBuildExecutableNames.some((executable) =>
				script.startsWith(`${executable} `),
			);
};

export const makeFluidBuildScript = (script: string): string => {
	return `${FLUID_BUILD_EXE} ${script}`;
};

export const registerDebugTrace = (str: string) => registerDebug(`${FLUID_BUILD_EXE}:${str}`);

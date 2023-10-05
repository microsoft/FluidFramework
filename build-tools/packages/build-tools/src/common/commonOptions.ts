/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

interface CommonOptions {
	defaultRoot?: string;
	root?: string;
	timer: boolean;
	logtime: boolean;
	quiet: boolean;
	verbose: boolean;
}

export const commonOptions: CommonOptions = {
	defaultRoot: process.env["_FLUID_DEFAULT_ROOT_"],
	root: process.env["_FLUID_ROOT_"],
	timer: false,
	logtime: false,
	quiet: false,
	verbose: false,
};

// This string is duplicated in the readme (multiple times): update readme if changing this.

export const commonOptionString = `     --defroot <path> Default root directory of the Fluid repo if infer failed (default: env _FLUID_DEFAULT_ROOT_)
     --root <path>    Root directory of the Fluid repo (default: env _FLUID_ROOT_)
     --timer          Measure elapsed time of each step
     --logtime        Display the current time on every status message for logging
  -v --verbose        Verbose messages
`;

export function parseOption(argv: string[], i: number) {
	const arg = argv[i];
	if (arg === "-v" || arg === "--verbose") {
		commonOptions.verbose = true;
		return 1;
	}

	if (arg === "--defroot") {
		if (i !== process.argv.length - 1) {
			commonOptions.defaultRoot = process.argv[++i];
			return 2;
		}
		console.error("ERROR: Missing argument for --defroot");
		return -1;
	}

	if (arg === "--root") {
		if (i !== process.argv.length - 1) {
			commonOptions.root = process.argv[++i];
			return 2;
		}
		console.error("ERROR: Missing argument for --root");
		return -1;
	}

	if (arg === "--timer") {
		commonOptions.timer = true;
		return 1;
	}

	if (arg === "--logtime") {
		commonOptions.logtime = true;
		return 1;
	}

	if (arg === "-q" || arg === "--quiet") {
		commonOptions.quiet = true;
		return 1;
	}

	// Not parsed
	return 0;
}

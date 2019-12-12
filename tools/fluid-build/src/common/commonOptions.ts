/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

interface CommonOptions {
    root?: string;
    timer: boolean;
    logtime: boolean;
    verbose: boolean;
};

export const commonOptions : CommonOptions = {
    root: process.env["_FLUID_ROOT_"],
    timer: false,
    logtime: false,
    verbose: false,
}

export const commonOptionString =
`     --root <path>    Root directory of the fluid repo (default: env _FLUID_ROOT_)
     --timer          Time separate phases
     --logtime        Display the current time on every status message for logging
  -v --verbose        Verbose messages
`;

export function parseOption(argv: string[], i: number) {
    const arg = argv[i];
    if (arg === "-v" || arg === "--verbose") {
        commonOptions.verbose = true;
        return 1;
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

    // Not parsed
    return 0;
}
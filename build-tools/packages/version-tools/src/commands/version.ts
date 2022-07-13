/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isVersionBumpTypeExtended } from "@fluidframework/build-tools";
import { Command, Flags } from "@oclif/core";
import * as semver from "semver";
import { table } from "table";
import {
    bumpInternalVersion,
    DEFAULT_PUBLIC_VERSION,
    fromInternalScheme,
    toInternalScheme,
    getVersionRange,
    isInternalVersionScheme,
} from "../internalVersionScheme";

interface VersionScheme {
    internalSchemeVersion: string;
    internalVersion: string;
    publicVersion: string;
    minorRange: string;
    patchRange: string;
    caretRange: string;
    tildeRange: string;
}

interface VersionInfo {
    input: string;
    bumpType: string;
    original: VersionScheme;
    bumped: VersionScheme;
}

/**
 * The root `version` command.
 */
// eslint-disable-next-line import/no-default-export
export default class VersionCommand extends Command {
    static description =
        "Convert version strings between regular semver and the Fluid internal version scheme.";

    static enableJsonFlag = true;

    static flags = {
        type: Flags.string({
            char: "t",
            description: "bump type",
            options: ["major", "minor", "patch", "current"],
            required: false,
        }),
        publicVersion: Flags.string({
            default: DEFAULT_PUBLIC_VERSION,
            description: "The public version to use in the Fluid internal version.",
        }),
    };

    static args = [
        {
            description: "The version to convert.",
            name: "version",
            required: true,
        },
    ];

    static examples = [
        {
            description: "The version can be a Fluid internal version.",
            command: "<%= config.bin %> <%= command.id %> 2.0.0-internal.1.0.0 --type minor",
        },
        {
            description: "The version can also be a semver with a bump type.",
            command: "<%= config.bin %> <%= command.id %> 1.0.0 --type minor",
        },
        {
            description: "If needed, you can provide a public version to override the default.",
            command: "<%= config.bin %> <%= command.id %> 1.0.0 --type patch --publicVersion 3.1.0",
        },
        {
            description: "You can use ^ and ~ as a shorthand.",
            command: "<%= config.bin %> <%= command.id %> ^1.0.0",
        },
    ];

    async run(): Promise<VersionInfo> {
        const { args, flags } = await this.parse(VersionCommand);

        const versionArg = await this.parseVersionArgument(args.version);
        const bumpType = flags.type ?? versionArg.bumpType ?? "";

        if (!isVersionBumpTypeExtended(bumpType)) {
            this.error(`Need a bump type`);
        }

        const { parsedVersion, isFluidInternalFormat } = versionArg;
        const originalVersion = isFluidInternalFormat
            ? parsedVersion
            : toInternalScheme(flags.publicVersion, parsedVersion);

        let bumpedVersion: semver.SemVer;
        switch (bumpType) {
            case "patch":
            case "minor":
            case "major": {
                bumpedVersion = bumpInternalVersion(originalVersion, bumpType);
                break;
            }

            case "current": {
                bumpedVersion = originalVersion;
                break;
            }

            default: {
                this.error(`Unsupported bump type: ${bumpType}`);
            }
        }

        const makeScheme = (v: semver.SemVer): VersionScheme => {
            const [publicVersion, internalVersion] = fromInternalScheme(v);
            const patchRange = getVersionRange(v, "patch");
            const minorRange = getVersionRange(v, "minor");

            const scheme: VersionScheme = {
                internalSchemeVersion: v.format(),
                internalVersion: internalVersion.format(),
                publicVersion: publicVersion.format(),
                minorRange,
                patchRange,
                caretRange: minorRange,
                tildeRange: patchRange,
            };

            return scheme;
        };

        const original = makeScheme(originalVersion);
        const bumped = makeScheme(bumpedVersion);

        const data: VersionInfo = {
            input: args.version,
            bumpType,
            original,
            bumped,
        };

        const tablify = (scheme: VersionScheme) => {
            return table(Object.entries(scheme), {
                columns: [{ alignment: "left" }, { alignment: "left" }, { alignment: "left" }],
                singleLine: true,
            });
        };

        this.log(`Input string: ${data.input}`);
        this.log(`Bump type: ${data.bumpType}`);

        this.log(`\nORIGINAL (${data.original.internalVersion})`);
        this.log(tablify(data.original));

        if (bumpType !== "current") {
            this.log(`\nBUMPED to ${data.bumped.internalSchemeVersion} (${data.bumpType})`);
            this.log(tablify(data.bumped));
        }

        // When the --json flag is passed, the command will return the raw data as JSON.
        return data;
    }

    /**
     * Parses a CLI input string as a version. The st
     *
     * @param versionString - A version string in either standard semver or Fluid internal format. If the string begins
     * with a "~" or "^", then the bump type will be set accordingly.
     * @returns An object containing the parsed bump type, parsed version, and a boolean indicating whether the parsed
     * version is in the Fluid internal format or not.
     */
    async parseVersionArgument(versionString: string): Promise<ParsedVersion> {
        const input = versionString;
        let parsedInput = versionString;
        let bumpType: string | undefined;

        // Infer the bump type from the ^ and ~
        if (input.startsWith("^") || input.startsWith("~")) {
            bumpType = input.startsWith("^") ? "minor" : "patch";
            parsedInput = input.slice(1);
        }

        const parsedVersion = semver.parse(parsedInput);
        if (parsedVersion === null) {
            this.error(`The version you provided isn't valid: "${parsedInput}"`);
        }
        return {
            bumpType,
            parsedVersion,
            isFluidInternalFormat: isInternalVersionScheme(parsedVersion) === true,
        };
    }
}

interface ParsedVersion {
    bumpType?: string;
    parsedVersion: semver.SemVer;
    isFluidInternalFormat: boolean;
}

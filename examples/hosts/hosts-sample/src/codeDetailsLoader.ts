/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as semver from "semver";
import {
    IFluidCodeDetails,
    IFluidCodeDetailsComparer,
} from "@fluidframework/core-interfaces";
import {
    ICodeDetailsLoader,
    IFluidModuleWithDetails,
} from "@fluidframework/container-loader";
import {
    IPackageIdentifierDetails,
} from "@fluidframework/web-code-loader";
import { fluidExport } from "./fauxComponent";
import { parsePackageDetails } from "./utils";

/**
 * Emulates a code loader capable of resolving a Fluid module defined in a local store
 * given the package name and version. The loader's implementation showcases one of possible
 * strategies of managing code version upgrades.
 */
class InMemoryCodeDetailsLoader
    implements ICodeDetailsLoader, IFluidCodeDetailsComparer {
    constructor(
        private readonly packageName: string,
        private readonly packageVersion: string,
    ) {}

    /**
     * The load method is called by the Fluid loader prior to instantiating the runtime.
     *
     * @param source - Code details written in the quorum.
     * @returns - Module entry point along with the module's own code details.
     */
    async load(source: IFluidCodeDetails): Promise<IFluidModuleWithDetails> {
        // Verify source code details match the current loaded code.
        const {
            name: sourcePackageName,
            version: sourcePackageVersion,
        } = parsePackageDetails(source.package);
        if (
            sourcePackageName !== this.packageName ||
            sourcePackageVersion === undefined
        ) {
            // Raise an error when code details written in the document differ from
            // the package supported by this code loader.
            throw new Error(
                "The document is created with a different package that is not supported by this code loader.",
            );
        }
        // Can only load code for the document schema version identical or lower than the emulated package.
        if (semver.lt(this.packageVersion, sourcePackageVersion)) {
            throw new Error(
                `The document code version [${sourcePackageVersion}] is newer than loaded code.`,
            );
        }
        return {
            module: { fluidExport },
            details: {
                package: {
                    name: this.packageName,
                    version: this.packageVersion,
                    fluid: { browser: {} },
                },
                config: {},
            },
        };
    }

    get IFluidCodeDetailsComparer() {
        return this;
    }

    /**
     * This method is called by the runtime to determine whether the currently loaded code satisfies
     * the new upgrade code proposal.
     *
     * @param candidate - The code details as produced by the load method.
     * @param constraint - The new upgrade proposal written in the quorum.
     * @returns True when the loaded code details satisfy the new constraint.
     */
    async satisfies(
        candidate: IFluidCodeDetails,
        constraint: IFluidCodeDetails,
    ): Promise<boolean> {
        const candidatePackage = parsePackageDetails(candidate.package);
        const constraintPackage = parsePackageDetails(constraint.package);
        if (
            candidatePackage.version === undefined ||
            constraintPackage.version === undefined
        ) {
            return false;
        }
        // The candidate package version should be greater than or equal to the constraint (proposal) version.
        return semver.gte(candidatePackage.version, constraintPackage.version);
    }

    /**
     * Compare method is called to determine whether a code proposal is an upgrade.
     * In this sample we simply compare semantic versions of code proposals.
     */
    async compare(
        a: IFluidCodeDetails,
        b: IFluidCodeDetails,
    ): Promise<number | undefined> {
        if (
            typeof a.package !== "object" ||
            typeof b.package !== "object" ||
            a.package.name !== b.package.name
        ) {
            return undefined;
        }
        const versionA = a.package.version as string;
        const versionB = b.package.version as string;
        return semver.lt(versionA, versionB)
            ? -1
            : semver.gt(versionA, versionB)
            ? 1
            : 0;
    }
}

/**
 * A factory method for a code loader emulating an in-memory package store.
 *
 * @param packageDetails - Specifies the package details used when loading the code by the container.
 */
export const getCodeLoaderForPackage = (
    packageDetails: IPackageIdentifierDetails,
) => {
    const { scope, name, version } = packageDetails;
    return new InMemoryCodeDetailsLoader(
        `@${scope}/${name}`,
        version ?? "1.0.0",
    );
};

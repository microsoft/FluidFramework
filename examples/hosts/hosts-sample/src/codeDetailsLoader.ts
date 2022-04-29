/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as semver from "semver";
import {
    IFluidCodeDetails,
    IFluidCodeDetailsComparer,
} from "@fluidframework/container-definitions";
import {
    ICodeDetailsLoader,
    IFluidModuleWithDetails,
} from "@fluidframework/container-loader";
import { fluidExport } from "./fauxComponent";
import { parsePackageDetails } from "./utils";

/**
 * Emulates a code loader capable of resolving Fluid modules defined in a local in-memory store
 * given the package name and version. The loader's implementation showcases one of possible
 * strategies of managing code version upgrades.
 */
export const InMemoryCodeDetailsLoader = new (class
    implements ICodeDetailsLoader, IFluidCodeDetailsComparer {
    /**
     * The load method is called by the Fluid loader prior to instantiating the runtime.
     *
     * @param source - Code details written in the quorum.
     * @returns - Module entry point along with the module's own code details.
     */
    async load(source: IFluidCodeDetails): Promise<IFluidModuleWithDetails> {
        // Get normalized package info
        const { name: sourcePackageName } = parsePackageDetails(source.package);
        if (sourcePackageName === undefined) {
            // Raise an error when code details written in the document differ from
            // the package supported by this code loader.
            throw new Error(
                "The document is created with a different package that is not supported by this code loader.",
            );
        }
        // Assemble and return the resolved Fluid module accompanied by the code details characterizing
        // its capabilities, such as supported range of code versions.
        // In this scenario we use the version 2.0.0 as the latest available in the store.
        return {
            module: { fluidExport },
            details: {
                package: {
                    name: sourcePackageName,
                    version: "2.0.0",
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
})();

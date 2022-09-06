import { VersionScheme, VersionBumpType } from "@fluid-tools/version-tools";
import { Context } from "@fluidframework/build-tools";
import { Command } from "@oclif/core";
import { ReleaseGroup, ReleasePackage } from "../releaseGroups";

export interface FluidReleaseStateHandlerData {
    context?: Context;
    releaseGroup?: ReleaseGroup | ReleasePackage;
    versionScheme?: VersionScheme;
    bumpType?: VersionBumpType;
    releaseVersion?: string;
    shouldSkipChecks?: boolean;
    shouldCheckPolicy?: boolean;
    shouldCheckBranch?: boolean;
    shouldCheckBranchUpdate?: boolean;
    shouldCommit?: boolean;
    shouldInstall?: boolean;
    shouldCheckMainNextIntegrated?: boolean;
    command?: Command;
}

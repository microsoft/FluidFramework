/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { VersionBumpType, VersionScheme } from "@fluid-tools/version-tools";
import {
    bumpTypeFlag,
    checkFlags,
    packageSelectorFlag,
    releaseGroupFlag,
    skipCheckFlag,
    versionSchemeFlag,
} from "../flags";
import { FluidReleaseStateHandler, FluidReleaseStateHandlerData, StateHandler } from "../handlers";
import { InstructionalPromptWriter, PromptWriter } from "../instructionalPromptWriter";
import { StateMachineCommand, FluidReleaseMachineDefinition } from "../machines";

/**
 * Releases a package or release group. Most of the logic for handling the release is contained in the
 * {@link FluidReleaseStateHandler}.
 */

export class ReleaseCommand<T extends typeof ReleaseCommand.flags> extends StateMachineCommand<T> {
    machine = FluidReleaseMachineDefinition;
    data: FluidReleaseStateHandlerData = {};
    handler: StateHandler | undefined;

    static summary = "Releases a package or release group.";
    static description = `First the release group's dependencies are checked. If any of the dependencies are also in the repo, then they're checked for the latest release version. If the dependencies have not yet been released, then the command prompts to perform the release of the dependency, then run the release command again.

    This process is continued until all the dependencies have been released, after which the release group itself is
    released.`;

    static flags = {
        releaseGroup: releaseGroupFlag({
            exclusive: ["package"],
            required: false,
        }),
        package: packageSelectorFlag({
            exclusive: ["releaseGroup"],
            required: false,
        }),
        bumpType: bumpTypeFlag({
            required: false,
        }),
        versionScheme: versionSchemeFlag({
            required: false,
        }),
        skipChecks: skipCheckFlag,
        ...checkFlags,
        ...StateMachineCommand.flags,
    };

    async init() {
        await super.init();

        const [context] = await Promise.all([this.getContext(), this.initMachineHooks()]);
        const flags = this.processedFlags;

        this.handler = new FluidReleaseStateHandler(this.machine, this.logger);
        this.data.context = context;
        this.data.promptWriter = new PromptWriter(this.logger);
        this.data.releaseGroup = flags.releaseGroup ?? flags.package!;
        this.data.releaseVersion = context.getVersion(this.data.releaseGroup);
        this.data.bumpType = flags.bumpType as VersionBumpType;
        this.data.versionScheme = flags.versionScheme as VersionScheme;

        this.data.shouldSkipChecks = flags.skipChecks;
        this.data.shouldCheckPolicy = flags.policyCheck && !flags.skipChecks;
        this.data.shouldCheckBranch = flags.branchCheck && !flags.skipChecks;
        this.data.shouldCheckMainNextIntegrated = !flags.skipChecks;
        this.data.shouldCommit = flags.commit && !flags.skipChecks;
        this.data.shouldInstall = flags.install && !flags.skipChecks;
        this.data.shouldCheckBranchUpdate = flags.updateCheck && !flags.skipChecks;
        this.data.exitFunc = (code?: number): void => this.exit(code);
        this.data.command = this;
    }
}

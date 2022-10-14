/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { VersionBumpType, detectVersionScheme } from "@fluid-tools/version-tools";

import {
    bumpTypeFlag,
    checkFlags,
    packageSelectorFlag,
    releaseGroupFlag,
    skipCheckFlag,
} from "../flags";
import { FluidReleaseStateHandler, FluidReleaseStateHandlerData, StateHandler } from "../handlers";
import { PromptWriter } from "../instructionalPromptWriter";
import { FluidReleaseMachine } from "../machines";
import { StateMachineCommand } from "../stateMachineCommand";

/**
 * Releases a package or release group. This command is mostly scaffolding and setting up the state machine, handlers,
 * and the data to pass to the handlers. Most of the logic for handling the release is contained in the
 * {@link FluidReleaseStateHandler} itself.
 */

export class ReleaseCommand<T extends typeof ReleaseCommand.flags> extends StateMachineCommand<T> {
    static summary = "Releases a package or release group.";
    static description = `The release command ensures that a release branch is in good condition, then walks the user through releasing a package or release group.

    The command runs a number of checks automatically to make sure the branch is in a good state for a release. If any of the dependencies are also in the repo, then they're checked for the latest release version. If the dependencies have not yet been released, then the command prompts to perform the release of the dependency, then run the release command again.

    This process is continued until all the dependencies have been released, after which the release group itself is released.`;

    machine = FluidReleaseMachine;
    handler: StateHandler | undefined;
    data: FluidReleaseStateHandlerData = {};

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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.data.releaseGroup = flags.releaseGroup ?? flags.package!;
        this.data.releaseVersion = context.getVersion(this.data.releaseGroup);
        this.data.bumpType = flags.bumpType as VersionBumpType;
        this.data.versionScheme = detectVersionScheme(this.data.releaseVersion);

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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A map of state machine states to descriptions. This is used in testing only to warn when new states get added or
 * removed.
 *
 * @internal
 */
export const stateDescriptions = new Map([
    ["Init", "The initial state that all machines start in."],
    ["Failed", "The terminal state that most states will transition to if they fail."],
    ["AskReleaseDetails", "Prompt the user for release details if needed."],
    ["CheckBranchName", "Succeeds if the current branch matches the expected pattern."],
    ["CheckBranchUpToDate", "Succeeds if the branch is up to date with the remote."],
    [
        "CheckForReleaseType",
        "Checks what the release type should be, based on the current branch and CLI arguments.",
    ],
    [
        "CheckHasRemote",
        "Succeeds if there is a remote upstream branch in the microsoft/FluidFramework repo.",
    ],
    ["CheckMainNextIntegrated", "Succeeds if the main and next branches are fully integrated."],
    [
        "CheckNoPrereleaseDependencies",
        "Succeeds if the release group has no dependencies on prerelease packages within the repo.",
    ],
    [
        "CheckNoPrereleaseDependencies2",
        "Succeeds if the release group has no dependencies on prerelease packages within the repo.",
    ],
    [
        "CheckNoPrereleaseDependencies3",
        "Succeeds if the release group has no dependencies on prerelease packages within the repo.",
    ],
    ["CheckPolicy", "Succeeds if the repo policy check succeeds."],
    ["CheckReleaseBranchDoesNotExist", "Succeeds if the release branch does not yet exist."],
    ["CheckReleaseGroupIsNotBumped", ""],
    ["CheckReleaseIsDone", "Succeeds if the current release has been done."],
    [
        "CheckShouldCommitBump",
        "Succeeds if the local bump changes should be committed to a new branch.",
    ],
    [
        "CheckShouldCommitDeps",
        "Succeeds if the local dependency changes should be committed to a new branch.",
    ],
    ["CheckShouldCommitReleasedDepsBump", "Succeeds if local deps bumps should be committed."],
    [
        "CheckShouldRunOptionalChecks",
        "Succeeds if the state machine's optional checks should be run.",
    ],
    ["CheckValidReleaseGroup", "Succeeds if the release group is valid."],
    [
        "DoBumpReleasedDependencies",
        "Does a bump of all prerelease dependencies that have been released (by checking npm).",
    ],
    ["DoChecks", "Does release preparedness checks."],
    ["DoMajorRelease", "Does a major release."],
    ["DoMinorRelease", "Does a minor release."],
    ["DoPatchRelease", "Does a patch release."],
    ["DoReleaseGroupBump", "Succeeds if the release group is bumped to the next version."],
    ["PromptToCommitBump", "Prompts to commit local bump changes manually."],
    ["PromptToCommitDeps", "Prompts to commit local dependency changes manually."],
    ["PromptToCommitReleasedDepsBump", "Prompts to commit local bump changes manually."],
    ["PromptToIntegrateNext", "Prompts the user to integrate main and next."],
    ["PromptToPRBump", "Prompts to create a bump PR from the current branch."],
    ["PromptToPRDeps", "Prompts to create a dependency bump PR from the current branch."],
    ["PromptToPRReleasedDepsBump", "TODO"],
    ["PromptToRelease", "Prompts to run a release build in ADO."],
    ["PromptToReleaseDeps", "Prompts to run a release builds in ADO for unreleased dependencies."],
]);

/**
 * A map of state machine actions to descriptions. THis is used in testing only to warn when new actions get added or
 * removed.
 *
 * @internal
 */
export const actionDescriptions = new Map([
    ["success", "Indicates that the state succeeded."],
    ["failure", "Indicates that the state failed."],
    ["patch", "Specialized action used for patch releases."],
    ["minor", "Specialized action used for minor releases."],
    ["major", "Specialized action used for major releases."],
]);

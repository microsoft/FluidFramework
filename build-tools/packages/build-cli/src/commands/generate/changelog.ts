/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import LegacyGenerateChangeLogCommand from "../../legacy/generate/changelog.js";

/**
 * Generate a changelog for packages based on changesets. Note that this process deletes the changeset files!
 *
 * The reason we use a search/replace approach to update the version strings in the changelogs is largely because of
 * https://github.com/changesets/changesets/issues/595. What we would like to do is generate the changelogs without
 * doing version bumping, but that feature does not exist in the changeset tools.
 */
export default class GenerateChangeLogCommand extends LegacyGenerateChangeLogCommand {
static readonly description =
"Generate a changelog for packages based on changesets. Note that this process deletes the changeset files!";

static readonly aliases = ["generate:changelogs"];

// Remove the deprecated property from the parent class
static readonly deprecated = undefined;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const changelogFunctions = require("changesets-format-with-issue-links");

const { getReleaseLine } = changelogFunctions.default;

exports.getReleaseLine = getReleaseLine;

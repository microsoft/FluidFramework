/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const getReleaseLine = require("./getReleaseLine");
const getDependencyReleaseLine = require("./getDependencyReleaseLine");
const changelogFunctions = {
	getReleaseLine: getReleaseLine.getReleaseLine,
	getDependencyReleaseLine: getDependencyReleaseLine.getDependencyReleaseLine,
};

exports.default = changelogFunctions;

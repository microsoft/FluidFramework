/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const getDependencyReleaseLine = require("./getDependencyReleaseLine.js");
const getReleaseLine = require("./getReleaseLine.js");
const changelogFunctions = {
	getReleaseLine: getReleaseLine.getReleaseLine,
	getDependencyReleaseLine: getDependencyReleaseLine.getDependencyReleaseLine,
};

exports.default = changelogFunctions;

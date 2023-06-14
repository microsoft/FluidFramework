/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, unicorn/prefer-module
const getReleaseLine = require("./getReleaseLine");
const getDependencyReleaseLine = require("./getDependencyReleaseLine");
const changelogFunctions = {
	getReleaseLine: getReleaseLine.getReleaseLine,
	getDependencyReleaseLine: getDependencyReleaseLine.getDependencyReleaseLine,
};

exports.default = changelogFunctions;

// eslint-disable-next-line import/no-default-export
export default changelogFunctions;

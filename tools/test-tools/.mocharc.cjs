/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const config = {
	"exit": true,
	"recursive": true,
	"unhandled-rejections": "strict",
	"forbid-only": true,
	"spec": "dist/test",
	"reporter": "mocha-multi-reporters",
	"reporter-options": "configFile=mocha-multi-reporter-config.json",
};

module.exports = config;

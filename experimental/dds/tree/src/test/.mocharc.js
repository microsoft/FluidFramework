/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

'use strict';

const testDriver = process.env.FLUID_TEST_DRIVER ? process.env.FLUID_TEST_DRIVER : 'local';
const packageDir = `${__dirname}/../..`;

const requiredModules = [
	`node_modules/@fluidframework/mocha-test-setup`, // General mocha setup e.g. suppresses console.log
	`node_modules/@fluidframework/test-drivers`, // Inject implementation of getFluidTestDriver, configured via FLUID_TEST_DRIVER
];

if (process.env.FLUID_TEST_LOGGER_PKG_PATH) {
	// Inject implementation of getTestLogger
	requiredModules.push(`${process.env.FLUID_TEST_LOGGER_PKG_PATH}`);
}

const config = {
	exit: true,
	recursive: true,
	require: requiredModules,
	'unhandled-rejections': 'strict',
};

if (process.env.FLUID_TEST_TIMEOUT !== undefined) {
	config['timeout'] = process.env.FLUID_TEST_TIMEOUT;
}

if (process.env.FLUID_TEST_REPORT === '1') {
	config['reporter'] = `xunit`;
	config['reporter-options'] = [
		// give the report file a unique name based on driver config
		`output=${packageDir}/nyc/${testDriver}-junit-report.xml`,
		`suiteName="dds tree - ${testDirver}"`,
	];
}

module.exports = config;

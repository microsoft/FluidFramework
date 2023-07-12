/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	server: {
		command: `npm run start:client:test -- --port ${process.env["PORT"]}`,
		port: process.env["PORT"],
		launchTimeout: 30000,
	},
	launch: {
		args: ["--no-sandbox", "--disable-setuid-sandbox", "--load-extension=./dist/bundle"],
		dumpio: process.env.FLUID_TEST_VERBOSE !== undefined, // output browser console to cmd line
	},
};

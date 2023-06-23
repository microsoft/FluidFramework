/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
	server: [
		{
			command: "npm run tinylicious 7070",
		},
		{
			command: "npm run build && npm run start:client:test",
		},
	],
	// server: {
	// 	command: `npm run start:client:test -- --port ${process.env["PORT"]}`,
	// 	port: process.env["PORT"],
	// },
	// server: {
	// 	command: "npm run start:e2e:test1",
	// },
	launch: {
		args: ["--no-sandbox", "--disable-setuid-sandbox", "--load-extension=./dist/bundle"],
		dumpio: process.env.FLUID_TEST_VERBOSE !== undefined, // output browser console to cmd line
	},
};

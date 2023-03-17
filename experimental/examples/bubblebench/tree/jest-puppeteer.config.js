/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

secondPort = Number.parseInt(process.env["PORT"]) + 1;
module.exports = {
	server: [
		{
			command: `npm run start -- --no-hot --no-live-reload --port ${process.env["PORT"]}`,
			port: process.env["PORT"],
			launchTimeout: 10000,
			usedPortAction: "error",
		},
		{
			command: `npm run start -- --no-hot --no-live-reload --port ${secondPort} --env tree=cursor`,
			port: secondPort,
			launchTimeout: 10000,
			usedPortAction: "error",
		},
	],
	launch: {
		args: ["--no-sandbox", "--disable-setuid-sandbox"], // https://github.com/puppeteer/puppeteer/blob/master/docs/troubleshooting.md#setting-up-chrome-linux-sandbox
		dumpio: process.env.FLUID_TEST_VERBOSE !== undefined, // output browser console to cmd line
		// slowMo: 500, // slows down process for easier viewing
		// headless: false, // run in the browser
	},
};

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This is a configuration file for PM2, a nodejs process manager. https://pm2.keymetrics.io/docs/usage/quick-start/
 * It's used to run and manage multiple processes from a single process. In this case, it's used to setup a cross-package hot reloading
 * solution by running  tsc:watch commands on multiple packages. The end result is that, for example, if you are running devtools-example locally and
 *  make a change in devtools-core then devtool-examples browser application will auto reload with the changes)
 */
module.exports = {
	apps: [
		{
			name: "devtools-example",
			script: "npm run start:client",
			cwd: "./",
		},
		{
			name: "devtools-core",
			script: "npm run tsc:watch",
			cwd: "../devtools-core",
		},
		{
			name: "devtools-view",
			script: "npm run tsc:watch",
			cwd: "../devtools-view",
		},
		{
			name: "devtools",
			script: "npm run tsc:watch",
			cwd: "../devtools",
		},
		// Add more packages as needed
	],
};

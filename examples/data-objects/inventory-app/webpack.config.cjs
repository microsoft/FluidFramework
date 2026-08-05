/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-example/webpack-fluid-loader");

module.exports = (env) =>
	fluidRoute.exampleAppConfig(__dirname, env, {
		html: { title: "Fluid Inventory" },
	});

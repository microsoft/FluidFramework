/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = (env) => ({
	extension: "cjs",
	mode: env.production ? "production" : "development",
});

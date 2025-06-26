/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

if (typeof global.TextEncoder === "undefined") {
	const { TextEncoder, TextDecoder } = require("util");
	global.TextEncoder = TextEncoder;
	global.TextDecoder = TextDecoder;
}

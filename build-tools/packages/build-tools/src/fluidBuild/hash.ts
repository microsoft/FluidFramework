/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import crypto from "crypto";

export const sha256 = (buffer: Buffer) => {
	return crypto.createHash("sha256").update(buffer).digest("hex");
};

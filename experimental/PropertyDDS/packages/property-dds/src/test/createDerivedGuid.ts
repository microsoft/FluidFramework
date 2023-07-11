/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as crypto from "crypto";

export function createDerivedGuid(referenceGuid: string, identifier: string) {
	const hash = crypto.createHash("sha1");
	hash.write(`${referenceGuid}:${identifier}`);
	hash.end();

	const hexHash = hash.digest("hex");
	return (
		`${hexHash.substr(0, 8)}-${hexHash.substr(8, 4)}-` +
		`${hexHash.substr(12, 4)}-${hexHash.substr(16, 4)}-${hexHash.substr(20, 12)}`
	);
}

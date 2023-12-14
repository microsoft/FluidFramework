/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeModularChangeCodec } from "../feature-libraries";

// These can't be an interfaces or they don't get the special string indexer bonus property.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type EncodedModularChange = {
	type: "data";
	change: ReturnType<ReturnType<typeof makeModularChangeCodec>["encode"]>;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type EncodedSchemaChange = {
	type: "schema";
	change: ReturnType<ReturnType<typeof makeModularChangeCodec>["encode"]>;
};

export interface EncodedSharedTreeChange {
	readonly changes: readonly (EncodedModularChange | EncodedSchemaChange)[];
}

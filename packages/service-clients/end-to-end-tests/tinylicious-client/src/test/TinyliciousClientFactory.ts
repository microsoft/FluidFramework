/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ScopeType } from "@fluidframework/driver-definitions/internal";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import {
	TinyliciousClient,
	type TinyliciousConnectionConfig,
} from "@fluidframework/tinylicious-client";
import { v4 as uuid } from "uuid";

/**
 * TODO
 */
export function createTinyliciousClient(
	id?: string,
	name?: string,
	scopes?: ScopeType[],
): TinyliciousClient {
	const user = {
		id: id ?? uuid(),
		name: name ?? uuid(),
	};
	const connectionProps: TinyliciousConnectionConfig = {
		tokenProvider: new InsecureTokenProvider("fooBar", user, scopes),
	};

	return new TinyliciousClient({
		connection: connectionProps,
	});
}

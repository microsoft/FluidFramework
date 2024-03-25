/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { SharingLinkRole, SharingLinkScope } from "@fluidframework/odsp-driver-definitions";
import { buildOdspShareLinkReqParams } from "../odspUtils.js";

describe("buildOdspShareLinkReqParams", () => {
	it("Should return appropriate query parameters when only scope is provided", async () => {
		const result = buildOdspShareLinkReqParams({ scope: SharingLinkScope.organization });
		assert.strictEqual(result, `createLinkScope=${SharingLinkScope.organization}`);
	});

	it("Should return appropriate query parameters when both scope and link role are provided", async () => {
		const result = buildOdspShareLinkReqParams({
			scope: SharingLinkScope.organization,
			role: SharingLinkRole.view,
		});
		assert.strictEqual(
			result,
			`createLinkScope=${SharingLinkScope.organization}&createLinkRole=${SharingLinkRole.view}`,
		);
	});

	it("Should return undefined when the input is undefined", async () => {
		const result = buildOdspShareLinkReqParams(undefined);
		assert.strictEqual(result, undefined);
	});
});

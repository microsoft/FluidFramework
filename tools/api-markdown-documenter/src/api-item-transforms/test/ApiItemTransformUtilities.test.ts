/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReleaseTag, type ApiItem } from "@microsoft/api-extractor-model";
import { expect } from "chai";

import { getEffectiveReleaseTag } from "../ApiItemTransformUtilities.js";

describe("ApiItemTransformUtilities", () => {
	describe("getEffectiveReleaseTag", () => {
		it("Item is tagged", () => {
			const item = {
				releaseTag: ReleaseTag.Public,
			} as unknown as ApiItem;

			expect(getEffectiveReleaseTag(item)).to.equal(ReleaseTag.Public);
		});

		it("Tag is inherited", () => {
			const parent = {
				releaseTag: ReleaseTag.Public,
			} as unknown as ApiItem;

			const item = {
				parent,
				releaseTag: undefined,
			} as unknown as ApiItem;

			expect(getEffectiveReleaseTag(item)).to.equal(ReleaseTag.Public);
		});

		it("No tag in ancestry", () => {
			const parent = {
				releaseTag: undefined,
			} as unknown as ApiItem;

			const item = {
				parent,
				releaseTag: undefined,
			} as unknown as ApiItem;

			expect(getEffectiveReleaseTag(item)).to.equal(ReleaseTag.None);
		});
	});
});

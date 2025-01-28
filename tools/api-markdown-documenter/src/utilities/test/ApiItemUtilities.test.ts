/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReleaseTag, type ApiItem } from "@microsoft/api-extractor-model";
import { expect } from "chai";

import { getEffectiveReleaseLevel } from "../ApiItemUtilities.js";

describe("ApiItemUtilities", () => {
	describe("getEffectiveReleaseTag", () => {
		it("Item is tagged", () => {
			const item = {
				releaseTag: ReleaseTag.Alpha,
			} as unknown as ApiItem;

			expect(getEffectiveReleaseLevel(item)).to.equal(ReleaseTag.Alpha);
		});

		it("Tag is inherited", () => {
			const parent = {
				releaseTag: ReleaseTag.Beta,
			} as unknown as ApiItem;

			const item = {
				parent,
				releaseTag: undefined,
			} as unknown as ApiItem;

			expect(getEffectiveReleaseLevel(item)).to.equal(ReleaseTag.Beta);
		});

		it("Tag is more restrictive than ancestors", () => {
			const parent = {
				releaseTag: ReleaseTag.Beta,
			} as unknown as ApiItem;

			const item = {
				parent,
				releaseTag: ReleaseTag.Alpha,
			} as unknown as ApiItem;

			expect(getEffectiveReleaseLevel(item)).to.equal(ReleaseTag.Alpha);
		});

		it("Tag is less restrictive than ancestors", () => {
			const parent = {
				releaseTag: ReleaseTag.Alpha,
			} as unknown as ApiItem;

			const item = {
				parent,
				releaseTag: ReleaseTag.Beta,
			} as unknown as ApiItem;

			expect(getEffectiveReleaseLevel(item)).to.equal(ReleaseTag.Alpha);
		});

		it("No tag in ancestry", () => {
			const parent = {
				releaseTag: undefined,
			} as unknown as ApiItem;

			const item = {
				parent,
				releaseTag: undefined,
			} as unknown as ApiItem;

			expect(getEffectiveReleaseLevel(item)).to.equal(ReleaseTag.Public);
		});
	});
});

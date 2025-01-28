/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReleaseTag, type ApiItem } from "@microsoft/api-extractor-model";
import { expect } from "chai";

import type { ApiItemTransformationConfiguration } from "../../api-item-transforms/index.js";
import { getEffectiveReleaseTag, isItemOrAncestorExcluded } from "../ApiItemTransformUtilities.js";

describe("ApiItemTransformUtilities", () => {
	describe("getEffectiveReleaseTag", () => {
		it("Item is tagged", () => {
			const item = {
				releaseTag: ReleaseTag.Alpha,
			} as unknown as ApiItem;

			expect(getEffectiveReleaseTag(item)).to.equal(ReleaseTag.Alpha);
		});

		it("Tag is inherited", () => {
			const parent = {
				releaseTag: ReleaseTag.Beta,
			} as unknown as ApiItem;

			const item = {
				parent,
				releaseTag: undefined,
			} as unknown as ApiItem;

			expect(getEffectiveReleaseTag(item)).to.equal(ReleaseTag.Beta);
		});

		it("Tag is more restrictive than ancestors", () => {
			const parent = {
				releaseTag: ReleaseTag.Beta,
			} as unknown as ApiItem;

			const item = {
				parent,
				releaseTag: ReleaseTag.Alpha,
			} as unknown as ApiItem;

			expect(getEffectiveReleaseTag(item)).to.equal(ReleaseTag.Alpha);
		});

		it("Tag is less restrictive than ancestors", () => {
			const parent = {
				releaseTag: ReleaseTag.Alpha,
			} as unknown as ApiItem;

			const item = {
				parent,
				releaseTag: ReleaseTag.Beta,
			} as unknown as ApiItem;

			expect(getEffectiveReleaseTag(item)).to.equal(ReleaseTag.Alpha);
		});

		it("No tag in ancestry", () => {
			const parent = {
				releaseTag: undefined,
			} as unknown as ApiItem;

			const item = {
				parent,
				releaseTag: undefined,
			} as unknown as ApiItem;

			expect(getEffectiveReleaseTag(item)).to.equal(ReleaseTag.Public);
		});
	});

	describe("isItemOrAncestorExcluded", () => {
		it("Item is excluded by user config", () => {
			const config = {
				exclude: (apiItem: ApiItem) => apiItem.displayName === "foo",
			} as unknown as ApiItemTransformationConfiguration;

			const item = {
				displayName: "foo",
			} as unknown as ApiItem;

			expect(isItemOrAncestorExcluded(item, config)).to.be.true;
		});

		it("Parent item is excluded by user config", () => {
			const config = {
				exclude: (apiItem: ApiItem) => apiItem.displayName === "foo",
			} as unknown as ApiItemTransformationConfiguration;

			const parent = {
				displayName: "foo",
			} as unknown as ApiItem;

			const item = {
				displayName: "bar",
				parent,
			} as unknown as ApiItem;

			expect(isItemOrAncestorExcluded(item, config)).to.be.true;
		});

		it("Neither item nor ancestors are excluded by user config", () => {
			const config = {
				exclude: (apiItem: ApiItem) => apiItem.displayName === "foo",
			} as unknown as ApiItemTransformationConfiguration;

			const parent = {
				displayName: "bar",
			} as unknown as ApiItem;

			const item = {
				displayName: "baz",
				parent,
			} as unknown as ApiItem;

			expect(isItemOrAncestorExcluded(item, config)).to.be.false;
		});
	});
});

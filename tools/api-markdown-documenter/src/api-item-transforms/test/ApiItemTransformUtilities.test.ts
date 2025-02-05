/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";
import { expect } from "chai";

import type { ApiItemTransformationConfiguration } from "../../api-item-transforms/index.js";
import { isItemOrAncestorExcluded } from "../ApiItemTransformUtilities.js";

describe("ApiItemTransformUtilities", () => {
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

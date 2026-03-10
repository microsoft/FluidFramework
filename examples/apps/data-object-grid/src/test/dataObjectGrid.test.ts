/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IDataObjectGrid, IDataObjectGridItem } from "../dataObjectGrid.js";
import type { ISingleHandleItem } from "../dataObjectRegistry.js";

describe("data-object-grid", () => {
	describe("IDataObjectGrid interface", () => {
		it("mock with getItems returns correct items", () => {
			// Verify that a mock conforming to IDataObjectGrid behaves as expected
			const mockItem = {
				id: "test-id",
				type: "clicker",
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as unknown as IDataObjectGridItem<ISingleHandleItem>;

			const mockGrid: Pick<IDataObjectGrid<ISingleHandleItem>, "getItems" | "getItem"> = {
				getItems: () => [mockItem],
				getItem: (id: string) => (id === "test-id" ? mockItem : undefined),
			};

			assert.equal(mockGrid.getItems().length, 1, "Expected one item");
			assert.equal(mockGrid.getItem("test-id")?.id, "test-id", "Expected to find item by id");
			assert.equal(
				mockGrid.getItem("nonexistent"),
				undefined,
				"Expected undefined for missing item",
			);
		});
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import type { DocumentNode } from "../../index.js";
import { checkForDuplicateDocumentPaths } from "../Utilities.js";

describe("ApiItem to Documentation transformation utilities tests", () => {
	describe("checkForDuplicateDocumentPaths", () => {
		it("Empty list", () => {
			expect(() => checkForDuplicateDocumentPaths([])).to.not.throw();
		});

		it("No duplicates", () => {
			const documents: DocumentNode[] = [
				{ documentPath: "foo" } as unknown as DocumentNode,
				{ documentPath: "bar" } as unknown as DocumentNode,
				{ documentPath: "baz" } as unknown as DocumentNode,
			];
			expect(() => checkForDuplicateDocumentPaths(documents)).to.not.throw();
		});

		it("Contains duplicates", () => {
			const documents: DocumentNode[] = [
				{ documentPath: "foo" } as unknown as DocumentNode,
				{ documentPath: "bar" } as unknown as DocumentNode,
				{ documentPath: "foo" } as unknown as DocumentNode,
			];
			expect(() => checkForDuplicateDocumentPaths(documents)).to.throw();
		});
	});
});

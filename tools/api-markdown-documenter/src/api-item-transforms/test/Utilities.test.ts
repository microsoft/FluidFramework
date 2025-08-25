/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import type { ApiDocument } from "../../ApiDocument.js";
import { checkForDuplicateDocumentPaths } from "../Utilities.js";

describe("ApiItem to Documentation transformation utilities tests", () => {
	describe("checkForDuplicateDocumentPaths", () => {
		it("Empty list", () => {
			expect(() => checkForDuplicateDocumentPaths([])).to.not.throw();
		});

		it("No duplicates", () => {
			const documents: ApiDocument[] = [
				{ documentPath: "foo" } as unknown as ApiDocument,
				{ documentPath: "bar" } as unknown as ApiDocument,
				{ documentPath: "baz" } as unknown as ApiDocument,
			];
			expect(() => checkForDuplicateDocumentPaths(documents)).to.not.throw();
		});

		it("Contains duplicates", () => {
			const documents: ApiDocument[] = [
				{ documentPath: "foo" } as unknown as ApiDocument,
				{ documentPath: "bar" } as unknown as ApiDocument,
				{ documentPath: "foo" } as unknown as ApiDocument,
			];
			expect(() => checkForDuplicateDocumentPaths(documents)).to.throw();
		});
	});
});

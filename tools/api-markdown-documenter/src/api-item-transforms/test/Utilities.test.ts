/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import type { MarkdownDocument } from "../../ApiDocument.js";
import { checkForDuplicateDocumentPaths } from "../Utilities.js";

describe("ApiItem to Documentation transformation utilities tests", () => {
	describe("checkForDuplicateDocumentPaths", () => {
		it("Empty list", () => {
			expect(() => checkForDuplicateDocumentPaths([])).to.not.throw();
		});

		it("No duplicates", () => {
			const documents: MarkdownDocument[] = [
				{ documentPath: "foo" } as unknown as MarkdownDocument,
				{ documentPath: "bar" } as unknown as MarkdownDocument,
				{ documentPath: "baz" } as unknown as MarkdownDocument,
			];
			expect(() => checkForDuplicateDocumentPaths(documents)).to.not.throw();
		});

		it("Contains duplicates", () => {
			const documents: MarkdownDocument[] = [
				{ documentPath: "foo" } as unknown as MarkdownDocument,
				{ documentPath: "bar" } as unknown as MarkdownDocument,
				{ documentPath: "foo" } as unknown as MarkdownDocument,
			];
			expect(() => checkForDuplicateDocumentPaths(documents)).to.throw();
		});
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import type { Document } from "../../ApiDocument.js";
import type { SectionNode } from "../../documentation-domain/index.js";
import { checkForDuplicateDocumentPaths } from "../Utilities.js";

describe("ApiItem to Documentation transformation utilities tests", () => {
	describe("checkForDuplicateDocumentPaths", () => {
		it("Empty list", () => {
			expect(() => checkForDuplicateDocumentPaths([])).to.not.throw();
		});

		it("No duplicates", () => {
			const documents: Document<SectionNode[]>[] = [
				{ documentPath: "foo" } as unknown as Document<SectionNode[]>,
				{ documentPath: "bar" } as unknown as Document<SectionNode[]>,
				{ documentPath: "baz" } as unknown as Document<SectionNode[]>,
			];
			expect(() => checkForDuplicateDocumentPaths(documents)).to.not.throw();
		});

		it("Contains duplicates", () => {
			const documents: Document<SectionNode[]>[] = [
				{ documentPath: "foo" } as unknown as Document<SectionNode[]>,
				{ documentPath: "bar" } as unknown as Document<SectionNode[]>,
				{ documentPath: "foo" } as unknown as Document<SectionNode[]>,
			];
			expect(() => checkForDuplicateDocumentPaths(documents)).to.throw();
		});
	});
});

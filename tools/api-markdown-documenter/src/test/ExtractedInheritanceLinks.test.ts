/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import { ApiItemKind, ApiModel } from "@microsoft/api-extractor-model";
import { expect } from "chai";

import { type ApiDocument, MarkdownRenderer, transformApiModel } from "../index.js";

import { testDataDirectoryPath } from "./EndToEndTestUtilities.js";

// These tests check the generated file paths and links, not just which members a type inherits.
// A class and an interface with the same name must have separate files so one page does not overwrite the other.
// On the derived interface's page, clicking `[Symbol.iterator]` must lead to that method's heading on the base interface's page.
describe("Extracted inheritance document targets", () => {
	let documents: readonly ApiDocument[];

	// Generate the small extracted suite in memory. We need the actual paths and headings here,
	// not snapshots of every page in each supported layout.
	before(() => {
		const model = new ApiModel();
		model.loadPackage(
			path.join(testDataDirectoryPath, "extracted-inheritance/test-inheritance.api.json"),
		);
		documents = transformApiModel({ apiModel: model, includeInheritedMembers: true });
	});

	/**
	 * Finds the generated document for one declaration, distinguishing merged declarations by kind.
	 */
	function getDocument(name: string, kind: ApiItemKind): ApiDocument {
		const document = documents.find(
			({ apiItem }) => apiItem.displayName === name && apiItem.kind === kind,
		);
		if (document === undefined) {
			throw new Error(`Missing document for ${kind} ${name}.`);
		}
		return document;
	}

	it("assigns distinct document paths to the class and interface with the same name", () => {
		const name = "TestClassWithMergedInterface";
		const classDocument = getDocument(name, ApiItemKind.Class);
		const interfaceDocument = getDocument(name, ApiItemKind.Interface);

		// TypeScript merges the instance members, but the documenter emits both declarations.
		// A path based on the name alone would let one page overwrite the other.
		expect(classDocument.documentPath).not.to.equal(interfaceDocument.documentPath);
	});

	it("links the inherited iterator to the heading emitted for its original declaration", () => {
		const base = getDocument("TestInterfaceWithSymbolKeys", ApiItemKind.Interface);
		const derived = getDocument("TestInterfaceInheritingSymbolKeys", ApiItemKind.Interface);
		const basePage = MarkdownRenderer.renderDocument(base, {}).contents;
		const derivedPage = MarkdownRenderer.renderDocument(derived, {}).contents;

		// Read the actual destination rather than asking the link builder what anchor it expects.
		// A change to either the generated link or the heading alone must fail this check.
		const heading = /<h[1-6] id="([^"]+)">\[Symbol\.iterator\]<\/h[1-6]>/u.exec(basePage);
		if (heading === null) {
			throw new Error("Missing heading for the iterator declaration on the base interface.");
		}
		expect(derivedPage).to.contain(
			String.raw`| [\[Symbol.iterator\]()](/${base.documentPath}#${heading[1]}) |`,
		);
	});
});

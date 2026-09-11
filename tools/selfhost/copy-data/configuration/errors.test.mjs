/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { logAndAddError, safeErrorMessage } from "./errors.mjs";

test("logs and records safe error messages only", (testContext) => {
	const messages = [];
	const originalError = console.error;
	console.error = (message) => messages.push(message);
	testContext.after(() => {
		console.error = originalError;
	});

	const errors = [];
	const safeError = new Error("Azure Fluid Relay Historian summary is missing its tree entries or blobs");
	safeError.name = "CopyError";
	logAndAddError(errors, safeError, { documentId: "document", stage: "document-copy" }, "Failed to copy document document");
	logAndAddError(errors, new Error("Basic secret-token"), { documentId: "other-document", stage: "document-copy" }, "Failed to copy document other-document");

	assert.deepEqual(errors, [
		{ documentId: "document", stage: "document-copy", message: "Azure Fluid Relay Historian summary is missing its tree entries or blobs" },
		{ documentId: "other-document", stage: "document-copy", message: "An unexpected error occurred" },
	]);
	assert.deepEqual(messages, [
		"Failed to copy document document: Azure Fluid Relay Historian summary is missing its tree entries or blobs",
		"Failed to copy document other-document: An unexpected error occurred",
	]);
});

test("allows messages from controlled copy-data error types", () => {
	for (const name of ["AzError", "ConfigurationError", "ConfirmationError", "CopyError", "CredentialError"]) {
		const error = new Error("A controlled error message");
		error.name = name;
		assert.equal(safeErrorMessage(error), "A controlled error message");
	}
});

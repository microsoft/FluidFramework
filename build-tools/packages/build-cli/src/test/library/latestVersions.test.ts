/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "chai";
import { describe, it } from "mocha";

import { isLatestInMajor, logLatestVersionResult } from "../../library/latestVersions.js";

describe("isLatestInMajor", () => {
	it("returns isLatest: true when input is the highest stable for its major", () => {
		const result = isLatestInMajor(["1.0.0", "1.2.3", "2.0.0"], "1.2.3");
		assert.deepEqual(result, { isLatest: true, majorVersion: 1 });
	});

	it("returns isLatest: false with latestVersion when a newer stable exists", () => {
		const result = isLatestInMajor(["1.0.0", "1.2.3"], "1.0.0");
		assert.deepEqual(result, { isLatest: false, latestVersion: "1.2.3", majorVersion: 1 });
	});

	it("returns isLatest: false with latestVersion: undefined when no stable found for the input major", () => {
		const result = isLatestInMajor(["1.0.0", "1.2.3"], "2.0.0");
		assert.deepEqual(result, {
			isLatest: false,
			latestVersion: undefined,
			majorVersion: 2,
		});
	});

	it("filters out internal/prerelease versions", () => {
		const result = isLatestInMajor(["1.0.0", "2.0.0-internal.1.0.0", "1.2.3"], "1.2.3");
		assert.deepEqual(result, { isLatest: true, majorVersion: 1 });
	});

	it("handles unsorted input correctly", () => {
		const result = isLatestInMajor(["1.2.3", "1.0.0", "2.0.0", "1.1.0"], "1.2.3");
		assert.deepEqual(result, { isLatest: true, majorVersion: 1 });
	});

	it("returns isLatest: false with latestVersion: undefined for empty version list", () => {
		const result = isLatestInMajor([], "1.0.0");
		assert.deepEqual(result, {
			isLatest: false,
			latestVersion: undefined,
			majorVersion: 1,
		});
	});

	it("returns isLatest: false with latestVersion: undefined when all versions are internal", () => {
		const result = isLatestInMajor(["2.0.0-internal.1.0.0", "2.0.0-internal.2.0.0"], "1.0.0");
		assert.deepEqual(result, { isLatest: false, latestVersion: undefined, majorVersion: 1 });
	});
});

describe("logLatestVersionResult", () => {
	it("logs success and shouldDeploy=true when version is latest", () => {
		const messages: string[] = [];
		const log = (msg: string): void => {
			messages.push(msg);
		};

		logLatestVersionResult(log, "1.2.3", { isLatest: true, majorVersion: 1 });

		assert.deepEqual(messages, [
			"Version 1.2.3 is the latest version for major version 1",
			"##vso[task.setvariable variable=shouldDeploy;isoutput=true]true",
			"##vso[task.setvariable variable=majorVersion;isoutput=true]1",
		]);
	});

	it("logs warning with latest version and shouldDeploy=false when not latest", () => {
		const messages: string[] = [];
		const log = (msg: string): void => {
			messages.push(msg);
		};

		logLatestVersionResult(log, "1.0.0", {
			isLatest: false,
			latestVersion: "1.2.3",
			majorVersion: 1,
		});

		assert.deepEqual(messages, [
			"##[warning]skipping deployment stage. input version 1.0.0 does not match the latest version 1.2.3",
			"##vso[task.setvariable variable=shouldDeploy;isoutput=true]false",
			"##vso[task.setvariable variable=majorVersion;isoutput=true]1",
		]);
	});

	it("logs warning about missing major and shouldDeploy=false when no matching major found", () => {
		const messages: string[] = [];
		const log = (msg: string): void => {
			messages.push(msg);
		};

		logLatestVersionResult(log, "2.0.0", {
			isLatest: false,
			latestVersion: undefined,
			majorVersion: 2,
		});

		assert.deepEqual(messages, [
			"##[warning]No major version found corresponding to input version 2.0.0",
			"##vso[task.setvariable variable=shouldDeploy;isoutput=true]false",
			"##vso[task.setvariable variable=majorVersion;isoutput=true]2",
		]);
	});
});

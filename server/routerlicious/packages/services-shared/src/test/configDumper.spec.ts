/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ConfigDumper } from "../configDumper";

describe("ConfigDumper", () => {
	describe("dumpConfig", () => {
		it("should redact values in secretNamesToRedactInConfigDump", () => {
			const nconf = {
				key1: "value1",
				key2: "value2",
			};

			const secretNamesToRedactInConfigDump = ["key1"];
			const configDumper = new ConfigDumper(
				nconf,
				undefined,
				secretNamesToRedactInConfigDump,
			);
			configDumper.dumpConfig();
			const redactedConfig = configDumper.getConfig();

			assert.strictEqual(redactedConfig.key1, "FluidREDACTED");
			assert.strictEqual(redactedConfig.key2, "value2");
		});

		it("redacted object should not be the same be as the config object if a value is redacted", () => {
			const nconf = {
				key1: "value1",
				key2: "value2",
			};

			const secretNamesToRedactInConfigDump = ["key1"];
			const configDumper = new ConfigDumper(
				nconf,
				undefined,
				secretNamesToRedactInConfigDump,
			);
			configDumper.dumpConfig();
			const redactedConfig = configDumper.getConfig();

			assert.notDeepStrictEqual(nconf, redactedConfig);
		});

		it("redacted object should not be the same be as the config object if no value is redacted", () => {
			const nconf = {
				key1: "value1",
				key2: "value2",
			};

			const secretNamesToRedactInConfigDump = [];
			const configDumper = new ConfigDumper(
				nconf,
				undefined,
				secretNamesToRedactInConfigDump,
			);
			configDumper.dumpConfig();
			const redactedConfig = configDumper.getConfig();

			assert.deepStrictEqual(nconf, redactedConfig);
			assert.notStrictEqual(nconf, redactedConfig);
		});

		it("should not throw an error if secretNamesToRedactInConfigDump values are not present in nconf", () => {
			const nconf = {
				key1: "value1",
				key2: "value2",
			};

			const secretNamesToRedactInConfigDump = ["key3"];
			const configDumper = new ConfigDumper(
				nconf,
				undefined,
				secretNamesToRedactInConfigDump,
			);

			assert.doesNotThrow(() => {
				configDumper.dumpConfig();
			});
		});

		it("should not throw an error if secretNamesToRedactInConfigDump contains duplicate values", () => {
			const nconf = {
				key1: "value1",
				key2: "value2",
			};

			const secretNamesToRedactInConfigDump = ["key1", "key1"];
			const configDumper = new ConfigDumper(
				nconf,
				undefined,
				secretNamesToRedactInConfigDump,
			);

			assert.doesNotThrow(() => {
				configDumper.dumpConfig();
			});
		});

		it("should redact keys inside nested objects in secretNamesToRedactInConfigDump", () => {
			const nconf = {
				key1: "value1",
				key2: "value2",
				nested: {
					key3: "nestedValue1",
					key4: "nestedValue2",
				},
			};

			const secretNamesToRedactInConfigDump = ["nested.key3"];
			const configDumper = new ConfigDumper(
				nconf,
				undefined,
				secretNamesToRedactInConfigDump,
			);
			configDumper.dumpConfig();
			const redactedConfig = configDumper.getConfig();

			assert.strictEqual(redactedConfig.key1, "value1");
			assert.strictEqual(redactedConfig.key2, "value2");
			assert.strictEqual(redactedConfig.nested.key3, "FluidREDACTED");
			assert.strictEqual(redactedConfig.nested.key4, "nestedValue2");
		});
	});
});

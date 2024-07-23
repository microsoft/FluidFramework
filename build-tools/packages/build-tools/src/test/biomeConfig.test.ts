import assert from "node:assert/strict";
import path from "node:path";
import { getSettingValuesFromBiomeConfig, loadBiomeConfig } from "../common/biomeConfig";
import { testDataPath } from "./init";

describe("loadConfig", () => {
	it("throws on missing config", async () => {
		const testFile = path.resolve(testDataPath, "biome/missing.jsonc");
		assert.rejects(async () => await loadBiomeConfig(testFile), Error);
	});

	it("throws on empty config", async () => {
		const testFile = path.resolve(testDataPath, "biome/empty.jsonc");
		assert.rejects(async () => await loadBiomeConfig(testFile), Error);
	});

	it("loads single config", async () => {
		const testFile = path.resolve(testDataPath, "biome/base.jsonc");
		const actual = await loadBiomeConfig(testFile);
		assert.notEqual(actual, undefined);
		assert.equal(actual.files?.ignoreUnknown, true);
	});

	it("loads config with extends", async () => {
		const testFile = path.resolve(testDataPath, "biome/pkg-a/biome.jsonc");
		const actual = await loadBiomeConfig(testFile);
		assert(actual !== undefined);
		assert(actual.files?.ignoreUnknown === true);
		assert(actual.files?.include?.length === 1);
		assert(actual.files?.include?.includes("src/**"));
		assert(actual.files?.ignore?.includes("**/pkg-a-ignore/*"));
		assert(actual.formatter?.ignore?.includes("ignored/**"));
	});
});

describe("getSettingValuesFromBiomeConfig", () => {
	describe("withExtends", async () => {
		const testFile = path.resolve(testDataPath, "biome/pkg-a/biome.jsonc");
		const testConfig = await loadBiomeConfig(testFile);

		it("formatter ignore settings are merged with root", async () => {
			const ignores = await getSettingValuesFromBiomeConfig(testConfig, "formatter", "ignore");
			assert(ignores.has("**/pkg-a-ignore/*"));
			assert(ignores.has("ignored/**"));
			assert(ignores.size === 2);
		});
	});
});

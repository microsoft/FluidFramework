#!/usr/bin/env node
/**
 * Cache Key Stability Test
 *
 * Validates that cache key computation is deterministic and consistent across:
 * - Multiple executions
 * - Different Node.js versions (when possible)
 * - Different platforms (manual cross-platform testing)
 *
 * Usage: ts-node scripts/test-cache-key-stability.ts
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface CacheKeyInputs {
	// Task identity
	packageName: string;
	taskName: string;
	executable: string;
	command: string;

	// Input files
	inputHashes: Array<{
		path: string;
		hash: string;
	}>;

	// Environment
	nodeVersion: string;
	platform: string;

	// Dependencies
	lockfileHash: string;

	// Tool configuration
	toolVersion?: string;
	configHashes?: Record<string, string>;
}

/**
 * Compute cache key from inputs
 * CRITICAL: Must be deterministic - same inputs always produce same key
 */
function computeCacheKey(inputs: CacheKeyInputs): string {
	// Sort object keys to ensure deterministic JSON serialization
	const sortedInputs = {
		packageName: inputs.packageName,
		taskName: inputs.taskName,
		executable: inputs.executable,
		command: inputs.command,
		inputHashes: inputs.inputHashes.sort((a, b) => a.path.localeCompare(b.path)),
		nodeVersion: inputs.nodeVersion,
		platform: inputs.platform,
		lockfileHash: inputs.lockfileHash,
		...(inputs.toolVersion && { toolVersion: inputs.toolVersion }),
		...(inputs.configHashes && {
			configHashes: Object.keys(inputs.configHashes)
				.sort()
				.reduce((acc, key) => {
					acc[key] = inputs.configHashes![key];
					return acc;
				}, {} as Record<string, string>),
		}),
	};

	const keyData = JSON.stringify(sortedInputs);
	return createHash("sha256").update(keyData).digest("hex");
}

/**
 * Hash file contents
 */
function hashFile(filePath: string): string {
	try {
		const content = readFileSync(filePath);
		return createHash("sha256").update(content).digest("hex");
	} catch (error) {
		throw new Error(`Failed to hash file ${filePath}: ${error}`);
	}
}

/**
 * Test: Same inputs produce same key
 */
function testDeterminism(): boolean {
	console.log("\n🧪 Test 1: Determinism (same inputs → same key)");

	const inputs: CacheKeyInputs = {
		packageName: "@fluidframework/build-tools",
		taskName: "compile",
		executable: "tsc",
		command: "tsc --build",
		inputHashes: [
			{ path: "src/index.ts", hash: "abc123" },
			{ path: "src/utils.ts", hash: "def456" },
		],
		nodeVersion: process.version,
		platform: process.platform,
		lockfileHash: "lockfile123",
		toolVersion: "5.3.0",
		configHashes: {
			"tsconfig.json": "config123",
		},
	};

	const key1 = computeCacheKey(inputs);
	const key2 = computeCacheKey(inputs);
	const key3 = computeCacheKey(inputs);

	const passed = key1 === key2 && key2 === key3;
	console.log(`  Key 1: ${key1.substring(0, 16)}...`);
	console.log(`  Key 2: ${key2.substring(0, 16)}...`);
	console.log(`  Key 3: ${key3.substring(0, 16)}...`);
	console.log(`  Result: ${passed ? "✅ PASS" : "❌ FAIL"}`);

	return passed;
}

/**
 * Test: Different input order produces same key (order-independent fields)
 */
function testInputHashOrder(): boolean {
	console.log("\n🧪 Test 2: Input hash order independence");

	const inputs1: CacheKeyInputs = {
		packageName: "@fluidframework/build-tools",
		taskName: "compile",
		executable: "tsc",
		command: "tsc --build",
		inputHashes: [
			{ path: "src/a.ts", hash: "hash1" },
			{ path: "src/b.ts", hash: "hash2" },
			{ path: "src/c.ts", hash: "hash3" },
		],
		nodeVersion: process.version,
		platform: process.platform,
		lockfileHash: "lock123",
	};

	const inputs2: CacheKeyInputs = {
		...inputs1,
		inputHashes: [
			{ path: "src/c.ts", hash: "hash3" },
			{ path: "src/a.ts", hash: "hash1" },
			{ path: "src/b.ts", hash: "hash2" },
		],
	};

	const key1 = computeCacheKey(inputs1);
	const key2 = computeCacheKey(inputs2);

	const passed = key1 === key2;
	console.log(`  Key 1 (a,b,c order): ${key1.substring(0, 16)}...`);
	console.log(`  Key 2 (c,a,b order): ${key2.substring(0, 16)}...`);
	console.log(`  Result: ${passed ? "✅ PASS" : "❌ FAIL"}`);

	return passed;
}

/**
 * Test: Different inputs produce different keys (collision resistance)
 */
function testCollisionResistance(): boolean {
	console.log("\n🧪 Test 3: Collision resistance (different inputs → different keys)");

	const baseInputs: CacheKeyInputs = {
		packageName: "@fluidframework/build-tools",
		taskName: "compile",
		executable: "tsc",
		command: "tsc --build",
		inputHashes: [{ path: "src/index.ts", hash: "abc123" }],
		nodeVersion: process.version,
		platform: process.platform,
		lockfileHash: "lock123",
	};

	// Test different variations
	const variations = [
		{ ...baseInputs, packageName: "different-package" },
		{ ...baseInputs, taskName: "different-task" },
		{ ...baseInputs, command: "tsc --build --incremental" },
		{
			...baseInputs,
			inputHashes: [{ path: "src/index.ts", hash: "different-hash" }],
		},
		{ ...baseInputs, nodeVersion: "v18.0.0" },
		{ ...baseInputs, platform: "win32" },
		{ ...baseInputs, lockfileHash: "different-lock" },
		{ ...baseInputs, toolVersion: "5.4.0" },
	];

	const baseKey = computeCacheKey(baseInputs);
	const keys = variations.map((v) => computeCacheKey(v));

	const allDifferent = keys.every((key) => key !== baseKey);
	const noDuplicates = new Set(keys).size === keys.length;

	console.log(`  Base key: ${baseKey.substring(0, 16)}...`);
	console.log(`  Variations tested: ${variations.length}`);
	console.log(`  All different from base: ${allDifferent ? "✅" : "❌"}`);
	console.log(`  No duplicates among variations: ${noDuplicates ? "✅" : "❌"}`);
	console.log(`  Result: ${allDifferent && noDuplicates ? "✅ PASS" : "❌ FAIL"}`);

	return allDifferent && noDuplicates;
}

/**
 * Test: Node version handling
 */
function testNodeVersionHandling(): boolean {
	console.log("\n🧪 Test 4: Node version handling");

	const inputs: CacheKeyInputs = {
		packageName: "@fluidframework/build-tools",
		taskName: "compile",
		executable: "tsc",
		command: "tsc --build",
		inputHashes: [{ path: "src/index.ts", hash: "abc123" }],
		nodeVersion: "v20.15.1",
		platform: process.platform,
		lockfileHash: "lock123",
	};

	const inputsV18: CacheKeyInputs = {
		...inputs,
		nodeVersion: "v18.20.0",
	};

	const inputsV22: CacheKeyInputs = {
		...inputs,
		nodeVersion: "v22.0.0",
	};

	const keyV20 = computeCacheKey(inputs);
	const keyV18 = computeCacheKey(inputsV18);
	const keyV22 = computeCacheKey(inputsV22);

	const allDifferent =
		keyV20 !== keyV18 && keyV18 !== keyV22 && keyV20 !== keyV22;

	console.log(`  Current Node: ${process.version}`);
	console.log(`  Key (v20.15.1): ${keyV20.substring(0, 16)}...`);
	console.log(`  Key (v18.20.0): ${keyV18.substring(0, 16)}...`);
	console.log(`  Key (v22.0.0):  ${keyV22.substring(0, 16)}...`);
	console.log(`  All different: ${allDifferent ? "✅" : "❌"}`);
	console.log(`  Result: ${allDifferent ? "✅ PASS" : "❌ FAIL"}`);
	console.log(
		"\n  ℹ️  Note: Different Node versions produce different cache keys",
	);
	console.log("     This is intentional to prevent cross-version issues");

	return allDifferent;
}

/**
 * Test: Platform handling
 */
function testPlatformHandling(): boolean {
	console.log("\n🧪 Test 5: Platform handling");

	const inputs: CacheKeyInputs = {
		packageName: "@fluidframework/build-tools",
		taskName: "compile",
		executable: "tsc",
		command: "tsc --build",
		inputHashes: [{ path: "src/index.ts", hash: "abc123" }],
		nodeVersion: process.version,
		platform: "linux",
		lockfileHash: "lock123",
	};

	const platforms = ["linux", "darwin", "win32"];
	const keys = platforms.map((platform) =>
		computeCacheKey({ ...inputs, platform }),
	);

	const allDifferent = new Set(keys).size === platforms.length;

	console.log(`  Current platform: ${process.platform}`);
	platforms.forEach((platform, i) => {
		console.log(`  Key (${platform}): ${keys[i].substring(0, 16)}...`);
	});
	console.log(`  All different: ${allDifferent ? "✅" : "❌"}`);
	console.log(`  Result: ${allDifferent ? "✅ PASS" : "❌ FAIL"}`);
	console.log(
		"\n  ℹ️  Note: Different platforms produce different cache keys",
	);
	console.log("     This prevents cross-platform compatibility issues");

	return allDifferent;
}

/**
 * Test: Real file hashing
 */
function testRealFileHashing(): boolean {
	console.log("\n🧪 Test 6: Real file hashing");

	try {
		// Hash this script file
		const scriptPath = __filename;
		const hash1 = hashFile(scriptPath);
		const hash2 = hashFile(scriptPath);

		const deterministic = hash1 === hash2;
		console.log(`  File: ${scriptPath}`);
		console.log(`  Hash 1: ${hash1.substring(0, 16)}...`);
		console.log(`  Hash 2: ${hash2.substring(0, 16)}...`);
		console.log(`  Deterministic: ${deterministic ? "✅" : "❌"}`);
		console.log(`  Result: ${deterministic ? "✅ PASS" : "❌ FAIL"}`);

		return deterministic;
	} catch (error) {
		console.log(`  ❌ FAIL: ${error}`);
		return false;
	}
}

/**
 * Test: Optional fields handling
 */
function testOptionalFields(): boolean {
	console.log("\n🧪 Test 7: Optional fields handling");

	const withOptional: CacheKeyInputs = {
		packageName: "@fluidframework/build-tools",
		taskName: "compile",
		executable: "tsc",
		command: "tsc --build",
		inputHashes: [{ path: "src/index.ts", hash: "abc123" }],
		nodeVersion: process.version,
		platform: process.platform,
		lockfileHash: "lock123",
		toolVersion: "5.3.0",
		configHashes: { "tsconfig.json": "config123" },
	};

	const withoutOptional: CacheKeyInputs = {
		packageName: "@fluidframework/build-tools",
		taskName: "compile",
		executable: "tsc",
		command: "tsc --build",
		inputHashes: [{ path: "src/index.ts", hash: "abc123" }],
		nodeVersion: process.version,
		platform: process.platform,
		lockfileHash: "lock123",
	};

	const key1 = computeCacheKey(withOptional);
	const key2 = computeCacheKey(withoutOptional);

	const different = key1 !== key2;
	console.log(`  With optional fields:    ${key1.substring(0, 16)}...`);
	console.log(`  Without optional fields: ${key2.substring(0, 16)}...`);
	console.log(`  Different: ${different ? "✅" : "❌"}`);
	console.log(`  Result: ${different ? "✅ PASS" : "❌ FAIL"}`);
	console.log(
		"\n  ℹ️  Note: Presence/absence of optional fields affects cache key",
	);

	return different;
}

/**
 * Main test runner
 */
function main() {
	console.log("╔════════════════════════════════════════════════════════════╗");
	console.log("║       Cache Key Stability Test Suite                      ║");
	console.log("╚════════════════════════════════════════════════════════════╝");

	console.log("\n📊 System Information:");
	console.log(`  Node.js: ${process.version}`);
	console.log(`  Platform: ${process.platform}`);
	console.log(`  Arch: ${process.arch}`);

	const tests = [
		testDeterminism,
		testInputHashOrder,
		testCollisionResistance,
		testNodeVersionHandling,
		testPlatformHandling,
		testRealFileHashing,
		testOptionalFields,
	];

	const results = tests.map((test) => test());
	const passed = results.filter((r) => r).length;
	const total = results.length;

	console.log("\n╔════════════════════════════════════════════════════════════╗");
	console.log("║                    Test Summary                            ║");
	console.log("╚════════════════════════════════════════════════════════════╝");
	console.log(`\n  Total tests: ${total}`);
	console.log(`  Passed: ${passed}`);
	console.log(`  Failed: ${total - passed}`);

	if (passed === total) {
		console.log("\n  ✅ All tests passed!");
		console.log("\n  Cache key computation is:");
		console.log("    • Deterministic (same inputs → same key)");
		console.log("    • Order-independent (for arrays)");
		console.log("    • Collision-resistant (different inputs → different keys)");
		console.log("    • Node version aware");
		console.log("    • Platform aware");
		console.log("    • Handles optional fields correctly");
		console.log("\n  ✅ Ready for implementation!");
		process.exit(0);
	} else {
		console.log("\n  ❌ Some tests failed!");
		console.log("\n  Please review the failures above before proceeding.");
		process.exit(1);
	}
}

main();

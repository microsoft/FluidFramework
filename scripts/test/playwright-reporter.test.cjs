/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { parseStringPromise } = require("xml2js");
const FluidPlaywrightReporter = require("../playwright-reporter.cjs");

const repoRoot = path.resolve(__dirname, "../..");
const reporterPath = path.join(repoRoot, "scripts", "playwright-reporter.cjs");
const playwrightCli = path.join(
	path.dirname(require.resolve("playwright/package.json")),
	"cli.js",
);
const testImport = `const { test, expect } = require(${JSON.stringify(require.resolve("playwright/test"))});`;

/**
 * Creates an isolated package and executes the real Playwright reporter lifecycle.
 * Files stay under nyc and are removed even when an assertion fails.
 * @param {import("node:test").TestContext} context - Owning test.
 * @param {Record<string, string>} files - Fixture test files.
 * @param {object} [config] - Additional Playwright settings.
 */
function fixture(context, files, config = {}) {
	const root = path.join(repoRoot, "nyc");
	fs.mkdirSync(root, { recursive: true });
	const directory = fs.mkdtempSync(path.join(root, "playwright-reporter-"));
	context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	fs.writeFileSync(
		path.join(directory, "package.json"),
		JSON.stringify({ name: "@fluid-test/reporter", private: true }),
	);
	const configFile = path.join(directory, "playwright.config.cjs");
	const settings = {
		testDir: "./tests",
		outputDir: "./nyc/test-results",
		workers: 1,
		retries: 0,
		timeout: 5000,
		reporter: [
			[reporterPath],
			["junit", { outputFile: "./nyc/builtin.xml" }],
			["json", { outputFile: "./nyc/results.json" }],
		],
		projects: [{ name: "chromium" }],
		...config,
	};
	fs.writeFileSync(configFile, `module.exports = ${JSON.stringify(settings)};`);
	for (const [name, source] of Object.entries(files)) {
		const file = path.join(directory, "tests", name);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, `${testImport}\n${source}`);
	}
	return {
		directory,
		configFile,
		reportFile: path.join(directory, "nyc", "junit-report.xml"),
		run(args = [], cwd = directory) {
			const env = { ...process.env };
			for (const key of Object.keys(env)) {
				if (key.startsWith("PLAYWRIGHT_JUNIT_") || key.startsWith("PLAYWRIGHT_JSON_")) {
					delete env[key];
				}
			}
			const result = spawnSync(
				process.execPath,
				[playwrightCli, "test", "-c", configFile, ...args],
				{
					cwd,
					env: { ...env, CI: "1", FORCE_COLOR: "0" },
					encoding: "utf8",
					timeout: 90_000,
				},
			);
			assert.ifError(result.error);
			assert.equal(result.signal, null, result.stderr);
			return result;
		},
	};
}

/** @param {string} file - Report path. */
async function readSuite(file) {
	const xml = await parseStringPromise(fs.readFileSync(file, "utf8"));
	assert.equal(xml.testsuites.testsuite.length, 1, "Exactly one suite per package");
	assert.equal(xml.testsuites.testsuite[0].$.name, "@fluid-test/reporter (Playwright)");
	assert.deepEqual(xml.testsuites.$, xml.testsuites.testsuite[0].$);
	return xml.testsuites.testsuite[0];
}

test("real runs preserve outcomes, retries, XML text, and attachments across files and projects", async (context) => {
	const run = fixture(
		context,
		{
			"alpha.spec.cjs": `
const fs = require("node:fs/promises");
test.describe("Panel A", () => { test("renders", () => {}); });
test.describe("Panel B", () => { test("renders", () => {}); });
test.skip("static skip", () => {});
test("dynamic skip", () => { test.skip(true, "not supported <yet>"); });
test("assertion failure", () => { expect(1).toBe(2); });
test("runtime error", () => { throw new Error("runtime <&> error"); });
test("flaky", ({}, info) => { console.log("attempt=" + info.retry); expect(info.retry).toBe(1); });
test("expected failure", () => { test.fail(); expect(1).toBe(2); });
test("unexpected pass", () => { test.fail(); });
test("timeout", async () => { test.setTimeout(50); await new Promise(() => {}); });
test('XML <&> " escaping', async ({}, info) => {
  info.annotations.push({ type: "issue", description: "a < b & c" });
  const file = info.outputPath("evidence.txt");
  await fs.writeFile(file, "evidence");
  await info.attach("evidence", { path: file, contentType: "text/plain" });
  console.log('stdout <&> ]]> \\u0001 \\x1b[31mred\\x1b[0m');
  console.error("stderr evidence");
});
`,
			"nested/beta.spec.cjs": `test.describe("Panel A", () => { test("renders", () => {}); });`,
		},
		{ retries: 1, projects: [{ name: "chromium" }, { name: "second-project" }] },
	);
	const result = run.run();
	assert.equal(result.status, 1, result.stdout + result.stderr);
	const suite = await readSuite(run.reportFile);
	assert.equal(suite.$.tests, "24");
	assert.equal(suite.$.failures, "8");
	assert.equal(suite.$.errors, "0");
	assert.equal(suite.$.skipped, "4");
	assert.equal(suite.testcase.length, 24);
	assert.equal(new Set(suite.testcase.map((entry) => entry.$.name)).size, 24);
	assert.equal(suite.$.hostname, undefined, "Do not mislabel a mixed-project suite");
	const prefix = path.relative(repoRoot, run.directory).split(path.sep).join("/");
	for (const entry of suite.testcase) {
		assert.ok(entry.$.classname.startsWith(`${prefix}/tests/`), entry.$.classname);
		assert.ok(!entry.$.classname.includes("\\"));
		assert.match(
			entry.$.name,
			/^\[(chromium|second-project)\] (alpha|nested\/beta)\.spec\.cjs > /,
		);
	}
	const find = (title) =>
		suite.testcase.find((entry) => entry.$.name === `[chromium] alpha.spec.cjs > ${title}`);
	assert.equal(find("flaky").failure, undefined);
	assert.match(find("flaky")["system-out"][0], /attempt=0[\s\S]*attempt=1/);
	assert.equal(find("expected failure").failure, undefined);
	assert.ok(find("unexpected pass").failure);
	assert.ok(find("timeout").failure);
	assert.match(find("runtime error").failure[0]._, /runtime <&> error/);
	assert.match(find("assertion failure").failure[0]._, /Attempt 1[\s\S]*Attempt 2/);
	assert.equal(find("dynamic skip").skipped[0].$.message, "not supported <yet>");
	const escaped = find('XML <&> " escaping');
	assert.equal(escaped.properties[0].property[0].$.value, "a < b & c");
	assert.match(escaped["system-out"][0], /stdout <&> \]\]>  red/);
	assert.doesNotMatch(escaped["system-out"][0], /\u0001|\u001b/);
	assert.equal(escaped["system-err"][0], "stderr evidence\n");
	const attachment = escaped["system-out"][0].match(/\[\[ATTACHMENT\|(.+)\]\]/)[1];
	assert.equal(
		fs.readFileSync(path.resolve(path.dirname(run.reportFile), attachment), "utf8"),
		"evidence",
	);
	const copiedNyc = path.join(run.directory, "copied", "package", "nyc");
	fs.cpSync(path.dirname(run.reportFile), copiedNyc, { recursive: true });
	assert.equal(
		fs.readFileSync(path.resolve(copiedNyc, attachment), "utf8"),
		"evidence",
		"Attachments remain reachable after copying the package's nyc directory",
	);

	const builtin = await parseStringPromise(
		fs.readFileSync(path.join(run.directory, "nyc", "builtin.xml"), "utf8"),
	);
	assert.equal(builtin.testsuites.testsuite.length, 4);
	assert.equal(
		Number(builtin.testsuites.$.failures) + Number(builtin.testsuites.$.errors),
		Number(suite.$.failures),
	);
	assert.equal(builtin.testsuites.$.skipped, suite.$.skipped);
	const builtinCases = builtin.testsuites.testsuite.flatMap((item) => item.testcase);
	assert.equal(
		builtinCases
			.filter((entry) => !entry.skipped)
			.reduce((sum, entry) => sum + Number(entry.$.time), 0)
			.toFixed(3),
		suite.testcase
			.filter((entry) => !entry.skipped)
			.reduce((sum, entry) => sum + Number(entry.$.time), 0)
			.toFixed(3),
	);
});

test("one-file passing runs work from a nested cwd and replace stale results", async (context) => {
	const run = fixture(context, { "passing.spec.cjs": `test("passes", () => {});` });
	fs.mkdirSync(path.dirname(run.reportFile), { recursive: true });
	fs.writeFileSync(run.reportFile, "stale report");
	const result = run.run([], path.join(run.directory, "tests"));
	assert.equal(result.status, 0, result.stdout + result.stderr);
	const suite = await readSuite(run.reportFile);
	assert.equal(suite.$.tests, "1");
	assert.equal(suite.$.failures, "0");
	assert.equal(suite.testcase[0].$.name, "[chromium] passing.spec.cjs > passes");
});

test("collection errors are visible even without testcases", async (context) => {
	const run = fixture(context, {
		"broken.spec.cjs": `throw new Error("collection <&> failure");`,
	});
	const result = run.run();
	assert.equal(result.status, 1, result.stdout + result.stderr);
	const suite = await readSuite(run.reportFile);
	assert.ok(Number(suite.$.errors) > 0);
	assert.ok(
		suite.testcase.some((entry) => entry.error?.[0]._.includes("collection <&> failure")),
	);
});

test("different packages retain distinct run and file identities for identical test titles", async (context) => {
	const first = fixture(context, { "same.spec.cjs": `test("same title", () => {});` });
	const second = fixture(context, { "same.spec.cjs": `test("same title", () => {});` });
	fs.writeFileSync(
		path.join(second.directory, "package.json"),
		JSON.stringify({ name: "@fluid-test/another-package", private: true }),
	);
	assert.equal(first.run().status, 0);
	assert.equal(second.run().status, 0);
	const firstSuite = await readSuite(first.reportFile);
	const secondXml = await parseStringPromise(fs.readFileSync(second.reportFile, "utf8"));
	const [secondSuite] = secondXml.testsuites.testsuite;
	assert.equal(secondSuite.$.name, "@fluid-test/another-package (Playwright)");
	assert.notEqual(firstSuite.testcase[0].$.classname, secondSuite.testcase[0].$.classname);
	assert.equal(firstSuite.testcase[0].$.name, secondSuite.testcase[0].$.name);
});

test("an empty successful run still produces one suite", async (context) => {
	const run = fixture(context, { "empty.spec.cjs": "" });
	const result = run.run(["--pass-with-no-tests"]);
	assert.equal(result.status, 0, result.stdout + result.stderr);
	const suite = await readSuite(run.reportFile);
	assert.equal(suite.$.tests, "0");
	assert.equal(suite.testcase, undefined);
});

test("report write errors fail an otherwise passing command", (context) => {
	const run = fixture(
		context,
		{ "passing.spec.cjs": `test("passes", () => {});` },
		{
			reporter: [[reporterPath]],
			outputDir: "./test-results",
		},
	);
	fs.writeFileSync(path.join(run.directory, "nyc"), "not a directory");
	const result = run.run();
	assert.equal(result.status, 1, result.stdout + result.stderr);
	assert.match(result.stderr + result.stdout, /Failed to write Fluid Playwright report/);
});

test("interruption, built paths, missing attachments, and invalid XML characters", async (context) => {
	const run = fixture(context, {});
	const reporter = new FluidPlaywrightReporter();
	const file = path.join(
		repoRoot,
		"packages",
		"common",
		"client-utils",
		"lib",
		"test",
		"playwright",
		"hash.test.js",
	);
	const fakeTest = {
		parent: { project: () => ({ name: "chromium", testDir: path.dirname(file) }) },
		location: { file, line: 1, column: 1 },
		titlePath: () => ["", "chromium", "hash.test.js", "hash", "interrupted"],
		annotations: [],
		outcome: () => "skipped",
		ok: () => true,
		expectedStatus: "passed",
		results: [
			{
				status: "interrupted",
				retry: 0,
				duration: 12,
				errors: [],
				stdout: ["lone surrogate \uD800, valid pair \uD83D\uDE00, control \u0000"],
				stderr: [],
				attachments: [{ path: path.join(run.directory, "missing.txt") }],
			},
		],
	};
	reporter.onBegin({ configFile: run.configFile }, { allTests: () => [fakeTest] });
	await reporter.onEnd({ status: "interrupted", startTime: new Date(), duration: 12 });
	const suite = await readSuite(run.reportFile);
	assert.equal(suite.$.failures, "1");
	assert.equal(suite.$.skipped, "0");
	assert.equal(
		suite.testcase[0].$.classname,
		"packages/common/client-utils/lib/test/playwright/hash.test.js",
	);
	assert.match(suite.testcase[0]["system-err"][0], /attachment '.+' is missing/);
	assert.equal(
		suite.testcase[0]["system-out"][0],
		"lone surrogate , valid pair \uD83D\uDE00, control ",
	);
});

test("all four configurations resolve the shared reporter relative to their module", () => {
	const base = path.join(repoRoot, "examples", "playwright.config.base.ts");
	const baseSource = fs.readFileSync(base, "utf8");
	const baseReference = baseSource.match(
		/resolve\(__dirname, "([^"]+playwright-reporter\.cjs)"\)/,
	);
	assert.ok(baseReference);
	assert.equal(path.resolve(path.dirname(base), baseReference[1]), reporterPath);
	assert.doesNotMatch(baseSource, /import\.meta|\["junit"/);
	for (const config of [
		"packages/common/client-utils/playwright.config.ts",
		"packages/tools/devtools/devtools-browser-extension/playwright.config.ts",
		"packages/tools/devtools/devtools-test-app/playwright.config.ts",
	]) {
		const filename = path.join(repoRoot, config);
		const source = fs.readFileSync(filename, "utf8");
		const reference = source.match(
			/new URL\("([^"]+playwright-reporter\.cjs)", import\.meta\.url\)/,
		);
		assert.ok(reference, config);
		assert.equal(path.resolve(path.dirname(filename), reference[1]), reporterPath);
		assert.doesNotMatch(source, /\["junit"/);
	}
});

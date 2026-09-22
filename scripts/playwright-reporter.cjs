/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("node:fs");
const path = require("node:path");
const { stripVTControlCharacters } = require("node:util");
const { Builder } = require("xml2js");

const repoRoot = path.resolve(__dirname, "..");

/** @typedef {import("playwright/types/testReporter").Reporter} Reporter */

/**
 * A JUnit testcase in xml2js's object representation.
 * @typedef {object} JUnitCase
 * @property {{ name: string, classname: string, time: number }} $ - Test identity and duration.
 * @property {{ property: { $: { name: string, value: string } }[] }} [properties] - Annotations.
 * @property {{ $: { message: string } }} [skipped] - Skip reason.
 * @property {{ $: { message: string, type: string }, _: string }} [failure] - Unexpected outcome.
 * @property {{ $: { message: string, type: string }, _: string }} [error] - Runner error.
 * @property {string} [system-out] - Standard output and attachment references.
 * @property {string} [system-err] - Standard error.
 */

/**
 * Removes terminal formatting and characters that XML 1.0 cannot represent.
 * @param {string} value - Text to serialize.
 * @returns {string} XML-compatible text.
 */
function clean(value) {
	return stripVTControlCharacters(value).replace(
		/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/gu,
		"",
	);
}

/**
 * Formats a relative path consistently on Windows and Linux.
 * @param {string} root - Base directory.
 * @param {string} file - Absolute file path.
 * @returns {string} Slash-separated relative path.
 */
function relativePath(root, file) {
	return path.relative(root, file).split(path.sep).join("/");
}

/**
 * Produces one package-named JUnit suite for Azure DevOps.
 * Uses only Playwright's public reporter API; no browser or Fluid runtime dependencies.
 * @implements {Reporter}
 */
class FluidPlaywrightReporter {
	/** @type {import("playwright/types/testReporter").FullConfig | undefined} */
	config;
	/** @type {import("playwright/types/testReporter").Suite | undefined} */
	suite;
	/** @type {import("playwright/types/testReporter").TestError[]} */
	errors = [];
	packageName = "";
	outputFile = "";

	printsToStdio() {
		return false;
	}

	/**
	 * @param {import("playwright/types/testReporter").FullConfig} config - Resolved configuration.
	 * @param {import("playwright/types/testReporter").Suite} suite - Complete test tree.
	 */
	onBegin(config, suite) {
		if (!config.configFile) {
			throw new Error("Fluid Playwright reporting requires a package-local config file.");
		}
		this.config = config;
		this.suite = suite;
		const packageDir = path.dirname(config.configFile);
		this.outputFile = path.join(packageDir, "nyc", "junit-report.xml");
		// Never publish a previous run's report if this run fails before completion.
		fs.rmSync(this.outputFile, { force: true });
		const packageJson = path.join(packageDir, "package.json");
		const { name } = JSON.parse(fs.readFileSync(packageJson, "utf8"));
		if (typeof name !== "string" || name.length === 0) {
			throw new Error(`Missing package name in '${packageJson}'.`);
		}
		this.packageName = name;
	}

	/** @param {import("playwright/types/testReporter").TestError} error - Error outside a test. */
	onError(error) {
		this.errors.push(error);
	}

	/**
	 * Serializes all attempts into one result per logical test, as built-in JUnit does.
	 * Expected failures and tests that pass on retry remain passing results.
	 * @param {import("playwright/types/testReporter").TestCase} test - Completed test.
	 */
	testCase(test) {
		const project = test.parent.project();
		if (!project) {
			throw new Error(`Missing Playwright project for '${test.location.file}'.`);
		}
		const file = relativePath(project.testDir, test.location.file);
		const title = test.titlePath().slice(3).join(" > ");
		const name = `${project.name ? `[${project.name}] ` : ""}${file} > ${title}`;
		/** @type {JUnitCase} */
		const entry = {
			$: {
				name: clean(name),
				classname: relativePath(repoRoot, test.location.file),
				time: test.results.reduce((sum, result) => sum + result.duration, 0) / 1000,
			},
		};
		if (test.annotations.length > 0) {
			entry.properties = {
				property: test.annotations.map((annotation) => ({
					$: { name: clean(annotation.type), value: clean(annotation.description ?? "") },
				})),
			};
		}
		const interrupted = test.results.some((result) => result.status === "interrupted");
		if (test.outcome() === "skipped" && !interrupted) {
			const reason = test.annotations
				.filter((annotation) => annotation.type === "skip" || annotation.type === "fixme")
				.map((annotation) => annotation.description)
				.filter(Boolean)
				.join("\n");
			entry.skipped = { $: { message: clean(reason) } };
		} else if (!test.ok() || interrupted) {
			const details = test.results
				.flatMap((result) =>
					result.errors.map(
						(error) =>
							`Attempt ${result.retry + 1} (${result.status}):\n${error.stack ?? error.message ?? error.value ?? ""}`,
					),
				)
				.join("\n\n");
			const message =
				details ||
				`Expected '${test.expectedStatus}', received '${test.results.at(-1)?.status}'.`;
			entry.failure = {
				$: { message: clean(message.split("\n").slice(0, 2).join(" ")), type: "FAILURE" },
				_: clean(
					`${test.location.file}:${test.location.line}:${test.location.column}\n${message}`,
				),
			};
		}

		const stdout = [];
		const stderr = [];
		for (const result of test.results) {
			stdout.push(...result.stdout.map(String));
			stderr.push(...result.stderr.map(String));
			for (const attachment of result.attachments) {
				// JUnit attachments require a file; inline bodies are not supported by built-in JUnit either.
				if (!attachment.path) {
					continue;
				}
				if (fs.existsSync(attachment.path)) {
					stdout.push(
						`\n[[ATTACHMENT|${relativePath(path.dirname(this.outputFile), attachment.path)}]]\n`,
					);
				} else {
					stderr.push(`\nWarning: attachment '${attachment.path}' is missing.\n`);
				}
			}
		}
		if (stdout.length > 0) {
			entry["system-out"] = clean(stdout.join(""));
		}
		if (stderr.length > 0) {
			entry["system-err"] = clean(stderr.join(""));
		}
		return entry;
	}

	/**
	 * Writes the report, including runner errors that have no associated test.
	 * @param {import("playwright/types/testReporter").FullResult} result - Final run status and timing.
	 * @returns {Promise<{ status: "failed" } | undefined>} Failed status if reporting fails.
	 */
	async onEnd(result) {
		try {
			if (!this.packageName || !this.config?.configFile) {
				throw new Error("Fluid Playwright reporter was not initialized.");
			}
			const cases = (this.suite?.allTests() ?? []).map((test) => this.testCase(test));
			for (const [index, error] of this.errors.entries()) {
				cases.push({
					$: {
						name: `Playwright runner error ${index + 1}`,
						classname: relativePath(repoRoot, this.config.configFile),
						time: 0,
					},
					error: {
						$: {
							message: clean(error.message ?? error.value ?? "Runner error"),
							type: "ERROR",
						},
						_: clean(error.stack ?? error.message ?? error.value ?? "Runner error"),
					},
				});
			}
			const attributes = {
				name: clean(`${this.packageName} (Playwright)`),
				tests: cases.length,
				failures: cases.filter((test) => test.failure).length,
				errors: cases.filter((test) => test.error).length,
				skipped: cases.filter((test) => test.skipped).length,
				time: result.duration / 1000,
				timestamp: result.startTime.toISOString(),
			};
			const xml = new Builder({ cdata: true }).buildObject({
				testsuites: {
					$: attributes,
					testsuite: { $: attributes, testcase: cases },
				},
			});
			await fs.promises.mkdir(path.dirname(this.outputFile), { recursive: true });
			await fs.promises.writeFile(this.outputFile, xml);
		} catch (error) {
			// A reporter failure must fail the command, not leave a success-shaped test run.
			console.error("Failed to write Fluid Playwright report:", error);
			return { status: "failed" };
		}
	}
}

module.exports = FluidPlaywrightReporter;

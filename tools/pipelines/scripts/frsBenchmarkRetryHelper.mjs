#!/usr/bin/env node
// Copyright (c) Microsoft Corporation and contributors. All rights reserved.
// Licensed under the MIT License.

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ansiPattern =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

const valueTypes = new Set(["SmallerIsBetter", "LargerIsBetter"]);
const significances = new Set(["Primary", "Secondary", "Diagnostic"]);

const transientClasses = [
  {
    name: "azure-front-door-origin-timeout",
    displayName: "HTTP 504 / Azure Front Door OriginTimeout",
    matchesLine(line) {
      return (
        /\b(?:http|status(?:code)?|code)\W*504\b/i.test(line) &&
        /\bAzure Front Door\b/i.test(line) &&
        /\bOriginTimeout\b/i.test(line)
      );
    },
  },
  {
    name: "upstream-connection-terminated-before-response-headers",
    displayName:
      "HTTP 503 / upstream connection terminated before response headers",
    matchesLine(line) {
      return (
        /\b(?:http|status(?:code)?|code)\W*503\b/i.test(line) &&
        /upstream connection terminated before response headers/i.test(line)
      );
    },
  },
];

const assertionPatterns = [/\bAssertionError\b/i, /\bERR_ASSERTION\b/i];
const unknownFailurePatterns = [
  /^\s*(?:Error|Fatal|Failed|Failure):\s+\S/i,
  /^\s*(?:TypeError|ReferenceError|SyntaxError|RangeError|EvalError|URIError):\s+\S/,
  /^\s*[1-9]\d*\s+failing\b/i,
  /^\s*\d+\)\s+.+/,
  /\bUnhandled(?:PromiseRejection)?\b/i,
  /\btests?\s+failed\b/i,
  /\b(?:request|operation|hook|benchmark)\b.*\bfailed\b/i,
];

export function stripAnsi(text) {
  return text.replace(ansiPattern, "");
}

export function sanitizeAdoControlSequences(text) {
  return text.replaceAll("##vso[", "## vso[");
}

export function escapeAzurePipelinesData(text) {
  return text
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

export function parseReport(text) {
  return JSON.parse(text, (_key, value) =>
    value === null ? Number.NaN : value,
  );
}

export function classifyFailureEvidence(logText) {
  const normalizedLogText = stripAnsi(logText).replaceAll("\r", "");
  const lines = normalizedLogText.split("\n");
  const classesByName = new Map();
  const unknownEvidence = [];
  const assertionEvidence = [];

  for (const line of lines) {
    for (const transientClass of transientClasses) {
      if (transientClass.matchesLine(line)) {
        classesByName.set(transientClass.name, {
          name: transientClass.name,
          displayName: transientClass.displayName,
        });
      }
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }
    if (
      transientClasses.some((transientClass) =>
        transientClass.matchesLine(trimmed),
      )
    ) {
      continue;
    }
    if (assertionPatterns.some((pattern) => pattern.test(trimmed))) {
      assertionEvidence.push(trimmed);
      continue;
    }
    if (unknownFailurePatterns.some((pattern) => pattern.test(trimmed))) {
      unknownEvidence.push(trimmed);
    }
  }

  const classes = [...classesByName.values()];
  return {
    classes,
    unknownEvidence,
    assertionEvidence,
    hasFailureEvidence:
      classes.length > 0 ||
      unknownEvidence.length > 0 ||
      assertionEvidence.length > 0,
    isExactlyOneAllowedClass:
      classes.length === 1 &&
      unknownEvidence.length === 0 &&
      assertionEvidence.length === 0,
  };
}

export function validateReport(report) {
  const errorPropertyPaths = [];
  const malformedReasons = [];
  let entryCount = 0;

  function fail(path, reason) {
    malformedReasons.push(`${path}: ${reason}`);
  }

  function checkNoErrorProperty(value, path) {
    if (value === null || typeof value !== "object") {
      return;
    }
    if (Object.hasOwn(value, "error")) {
      errorPropertyPaths.push(`${path}.error`);
    }
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        checkNoErrorProperty(item, `${path}[${index}]`);
      }
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      checkNoErrorProperty(item, `${path}.${key}`);
    }
  }

  function isString(value) {
    return typeof value === "string" && value.length > 0;
  }

  function isNumber(value) {
    return typeof value === "number";
  }

  function validateMeasurement(value, path, primary) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail(path, "measurement must be an object");
      return;
    }
    if (!isString(value.name)) {
      fail(`${path}.name`, "measurement name must be a non-empty string");
    }
    if (!isNumber(value.value)) {
      fail(`${path}.value`, "measurement value must be a number");
    }
    if (primary) {
      if (!isString(value.units)) {
        fail(
          `${path}.units`,
          "primary measurement units must be a non-empty string",
        );
      }
      if (!valueTypes.has(value.type)) {
        fail(`${path}.type`, "primary measurement type must be valid");
      }
      if (value.significance !== "Primary") {
        fail(
          `${path}.significance`,
          "primary measurement significance must be Primary",
        );
      }
    } else {
      if (value.units !== undefined && typeof value.units !== "string") {
        fail(
          `${path}.units`,
          "measurement units must be a string when present",
        );
      }
      if (value.type !== undefined && !valueTypes.has(value.type)) {
        fail(`${path}.type`, "measurement type must be valid when present");
      }
      if (
        value.significance !== undefined &&
        !significances.has(value.significance)
      ) {
        fail(
          `${path}.significance`,
          "measurement significance must be valid when present",
        );
      }
    }
  }

  function validateCollectedData(value, path) {
    if (!Array.isArray(value) || value.length === 0) {
      fail(path, "entry data must be a non-empty measurement array");
      return;
    }
    validateMeasurement(value[0], `${path}[0]`, true);
    for (let index = 1; index < value.length; index++) {
      validateMeasurement(value[index], `${path}[${index}]`, false);
    }
  }

  function validateNode(value, path) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail(path, "report node must be an object");
      return;
    }
    const hasSuiteFields =
      Object.hasOwn(value, "suiteName") || Object.hasOwn(value, "contents");
    const hasEntryFields =
      Object.hasOwn(value, "benchmarkName") || Object.hasOwn(value, "data");
    if (hasSuiteFields && hasEntryFields) {
      fail(path, "report node cannot be both a suite and an entry");
      return;
    }
    if (hasSuiteFields) {
      if (!isString(value.suiteName)) {
        fail(`${path}.suiteName`, "suite name must be a non-empty string");
      }
      validateReportArray(value.contents, `${path}.contents`);
      return;
    }
    if (hasEntryFields) {
      if (!isString(value.benchmarkName)) {
        fail(
          `${path}.benchmarkName`,
          "benchmark name must be a non-empty string",
        );
      }
      validateCollectedData(value.data, `${path}.data`);
      entryCount++;
      return;
    }
    fail(path, "report node must be a suite or an entry");
  }

  function validateReportArray(value, path) {
    if (!Array.isArray(value) || value.length === 0) {
      fail(path, "report array must be non-empty");
      return;
    }
    for (const [index, item] of value.entries()) {
      validateNode(item, `${path}[${index}]`);
    }
  }

  checkNoErrorProperty(report, "$report");
  validateReportArray(report, "$report");
  if (entryCount === 0) {
    malformedReasons.push(
      "$report: report must contain at least one benchmark entry",
    );
  }

  return {
    valid:
      malformedReasons.length === 0 &&
      errorPropertyPaths.length === 0 &&
      entryCount > 0,
    entryCount,
    errorPropertyPaths,
    malformedReasons,
  };
}

export function validateReportFile(reportPath) {
  if (!existsSync(reportPath)) {
    return {
      valid: false,
      exists: false,
      entryCount: 0,
      errorPropertyPaths: [],
      malformedReasons: [`${reportPath}: report file does not exist`],
    };
  }
  try {
    return {
      exists: true,
      ...validateReport(parseReport(readFileSync(reportPath, "utf8"))),
    };
  } catch (error) {
    return {
      valid: false,
      exists: true,
      entryCount: 0,
      errorPropertyPaths: [],
      malformedReasons: [
        error instanceof Error ? error.message : String(error),
      ],
    };
  }
}

export function analyzeAttempt({ childStatus, logText, reportPath }) {
  const classification = classifyFailureEvidence(logText);
  const report = validateReportFile(reportPath);
  return {
    childStatus,
    classification,
    report,
    canRetry:
      childStatus !== 0 &&
      classification.isExactlyOneAllowedClass &&
      report.errorPropertyPaths.length === 0,
    downgradeEligible:
      childStatus !== 0 &&
      classification.isExactlyOneAllowedClass &&
      report.valid,
    successEligible:
      childStatus === 0 && !classification.hasFailureEvidence && report.valid,
  };
}

function readLog(logPath) {
  return existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
}

function parseArguments(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (value === undefined || !key.startsWith("--")) {
      throw new Error(`Invalid arguments: ${args.join(" ")}`);
    }
    result[key.slice(2)] = value;
  }
  return result;
}

function formatIneligibleReason(analysis) {
  const reasons = [];
  if (analysis.childStatus === 0) {
    reasons.push("child exited with status 0");
  }
  if (analysis.classification.classes.length !== 1) {
    reasons.push(
      `detected ${analysis.classification.classes.length} allowlisted transient classes`,
    );
  }
  if (analysis.classification.unknownEvidence.length > 0) {
    reasons.push(
      `${analysis.classification.unknownEvidence.length} unknown failure evidence line(s)`,
    );
  }
  if (analysis.classification.assertionEvidence.length > 0) {
    reasons.push(
      `${analysis.classification.assertionEvidence.length} assertion failure evidence line(s)`,
    );
  }
  if (!analysis.report.valid) {
    reasons.push(
      `invalid report: ${[
        ...analysis.report.errorPropertyPaths,
        ...analysis.report.malformedReasons,
      ].join("; ")}`,
    );
  }
  return reasons.join("; ");
}

function runCli() {
  const [command, ...args] = process.argv.slice(2);
  const parsed = parseArguments(args);
  if (command === "escape-ado-message") {
    console.log(escapeAzurePipelinesData(parsed.message ?? ""));
    return;
  }
  if (command === "sanitize-line") {
    console.log(sanitizeAdoControlSequences(parsed.line ?? ""));
    return;
  }

  const status = Number(parsed.status ?? 0);
  const logText = parsed.log === undefined ? "" : readLog(parsed.log);
  const reportPath = parsed.report;
  const analysis = analyzeAttempt({ childStatus: status, logText, reportPath });

  if (command === "analyze") {
    console.log(JSON.stringify(analysis));
    return;
  }
  if (command === "can-retry") {
    if (analysis.canRetry) {
      console.log(analysis.classification.classes[0].displayName);
      return;
    }
    console.error(formatIneligibleReason(analysis));
    process.exitCode = 1;
    return;
  }
  if (command === "final-downgrade") {
    if (analysis.downgradeEligible) {
      console.log(analysis.classification.classes[0].displayName);
      return;
    }
    console.error(formatIneligibleReason(analysis));
    process.exitCode = 1;
    return;
  }
  if (command === "success-ok") {
    if (analysis.successEligible) {
      return;
    }
    console.error(formatIneligibleReason(analysis));
    process.exitCode = 1;
    return;
  }
  if (command === "report-valid") {
    if (analysis.report.valid) {
      return;
    }
    console.error(formatIneligibleReason(analysis));
    process.exitCode = 1;
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli();
}

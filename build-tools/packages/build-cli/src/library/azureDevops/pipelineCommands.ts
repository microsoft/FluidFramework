/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Helpers for formatting Azure DevOps "pipeline commands" - the `##vso[...]` log lines that
 * Azure Pipelines interprets to set output variables, log issues, etc.
 *
 * See {@link https://learn.microsoft.com/azure/devops/pipelines/scripts/logging-commands | Azure
 * DevOps logging commands documentation}.
 *
 * These helpers only build the strings; emitting them is up to the caller (commands typically
 * use `this.log(...)`).
 */

/**
 * Escapes a string for use as a property value in an Azure Pipelines logging command (the part
 * before the closing `]`). Properties have a stricter escape set because `;` separates properties
 * and `]` terminates the command header.
 *
 * See {@link https://learn.microsoft.com/azure/devops/pipelines/scripts/logging-commands#formatting-commands | logging command formatting}.
 */
function escapeProperty(value: string): string {
	return value
		.replace(/%/g, "%25")
		.replace(/\r/g, "%0D")
		.replace(/\n/g, "%0A")
		.replace(/;/g, "%3B")
		.replace(/]/g, "%5D");
}

/**
 * Escapes a string for use as the data portion of an Azure Pipelines logging command (the part
 * after the closing `]`). Only `%`, CR, and LF need to be encoded here.
 */
function escapeData(value: string): string {
	return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** Options for {@link generateSetVariableString}. */
export interface SetVariableOptions {
	/**
	 * When `true`, marks the variable as an output variable (`isOutput=true`) so it can be
	 * consumed by other jobs/stages in the pipeline.
	 *
	 * @defaultValue `false`
	 */
	isOutput?: boolean;
}

/**
 * Generates a `##vso[task.setvariable ...]` pipeline command string that sets a pipeline
 * variable.
 *
 * Numeric and boolean values are stringified via the standard JavaScript coercion (e.g. `42`
 * becomes `"42"`, `true` becomes `"true"`).
 *
 * Reserved characters in `name` and `value` are escaped per Azure Pipelines logging command
 * rules so that values containing `;`, `]`, `%`, or newlines do not corrupt the command.
 */
export function generateSetVariableString(
	name: string,
	value: string | number | boolean,
	options: SetVariableOptions = {},
): string {
	const isOutput = options.isOutput ?? false;
	const suffix = isOutput ? ";isOutput=true" : "";
	return `##vso[task.setvariable variable=${escapeProperty(name)}${suffix}]${escapeData(`${value}`)}`;
}

/** Severity levels accepted by `##vso[task.logissue]`. */
export type LogIssueLevel = "warning" | "error";

/**
 * Generates a `##vso[task.logissue ...]` pipeline command string that surfaces a warning or error
 * in the Azure DevOps build summary.
 *
 * Reserved characters in `message` are escaped per Azure Pipelines logging command rules.
 */
export function generateLogIssueString(level: LogIssueLevel, message: string): string {
	return `##vso[task.logissue type=${level}]${escapeData(message)}`;
}

/**
 * Generates a `##[warning]...` log line. Unlike {@link generateLogIssueString} (which adds an
 * entry to the build summary), this only classifies the log line itself as a warning in the
 * Azure Pipelines log view.
 *
 * Reserved characters in `message` are escaped per Azure Pipelines logging command rules.
 */
export function generateWarningString(message: string): string {
	return `##[warning]${escapeData(message)}`;
}

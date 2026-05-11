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

/** Options for {@link formatSetVariable}. */
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
 * Formats a `##vso[task.setvariable ...]` pipeline command that sets a pipeline variable.
 */
export function formatSetVariable(
	name: string,
	value: string,
	options: SetVariableOptions = {},
): string {
	const isOutput = options.isOutput ?? false;
	const suffix = isOutput ? ";isOutput=true" : "";
	return `##vso[task.setvariable variable=${name}${suffix}]${value}`;
}

/** Severity levels accepted by `##vso[task.logissue]`. */
export type LogIssueLevel = "warning" | "error";

/**
 * Formats a `##vso[task.logissue ...]` pipeline command that surfaces a warning or error in the
 * Azure DevOps build summary.
 */
export function formatLogIssue(level: LogIssueLevel, message: string): string {
	return `##vso[task.logissue type=${level}]${message}`;
}

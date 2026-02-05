/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import * as path from "path";

import { BaseFileLogger } from "./baseFileLogger.js";
import { LogLevel } from "@fluidframework/core-interfaces";

/**
 * FileLogger that writes events into a defined CSV file
 * @internal
 */
export class JSONFileLogger extends BaseFileLogger {
	constructor(
		filePath: string,
		eventsPerFlush: number = 50,
		defaultProps?: Record<string, string | number>,
	) {
		super(filePath, eventsPerFlush, defaultProps);
		const dirName = path.dirname(this.filePath);
		fs.mkdirSync(dirName, { recursive: true });
		fs.appendFileSync(this.filePath, "[");
	}

	public get minLogLevel(): LogLevel {
		return LogLevel.default;
	}

	public async close(): Promise<void> {
		await super.close();
		const dirName = path.dirname(this.filePath);
		fs.mkdirSync(dirName, { recursive: true });
		fs.appendFileSync(this.filePath, "]");
	}
}

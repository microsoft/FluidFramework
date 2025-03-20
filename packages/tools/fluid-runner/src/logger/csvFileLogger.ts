/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";

import { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";
import { Parser } from "@json2csv/plainjs";

import { BaseFileLogger } from "./baseFileLogger.js";

/**
 * FileLogger that writes events into a defined CSV file
 * @internal
 */
export class CSVFileLogger extends BaseFileLogger {
	/**
	 * Store the column names to write as the CSV header.
	 *
	 * Order of this set is used for the oder of columns.
	 */
	private readonly columns = new Set<string>();

	protected async flush(): Promise<void> {
		// No flushing is performed since we need all log entries to determine set of CSV columns
	}

	public send(event: ITelemetryBaseEvent): void {
		// eslint-disable-next-line guard-for-in, no-restricted-syntax
		for (const prop in event) {
			// Include "prop" as a column, moving it to the end of the column set if already included.
			this.columns.add(prop);
		}
		super.send(event);
	}

	public async close(): Promise<void> {
		await super.close();
		// eslint-disable-next-line guard-for-in, no-restricted-syntax
		for (const field in this.defaultProps) {
			// Include "field" as a column, moving it to the end of the column set if already included.
			this.columns.add(field);
		}
		const parser = new Parser({
			// Orders columns based on order of the set, which puts most recently seen fields from send at the end.
			fields: Array.from(this.columns),
		});
		fs.writeFileSync(this.filePath, parser.parse(this.events));
	}
}

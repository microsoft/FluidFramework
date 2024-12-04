/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs"; // eslint-disable-line import/no-nodejs-modules

import type { ITelemetryBufferedLogger } from "@fluid-internal/test-driver-definitions";
import type { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";

export class FileLogger implements ITelemetryBufferedLogger {
	private logs: ITelemetryBaseEvent[] = [];

	public constructor(
		private readonly outputDirectoryPath: string = "/home/alex/code/FluidFramework/packages/test/test-end-to-end-tests",
		private readonly fileNamePrefix: string = "log",
		private readonly baseLogger?: ITelemetryBufferedLogger | undefined,
	) {}

	async flush(): Promise<void> {
		// First ensure we flush the "real" logger, before trying to write the file.
		await this.baseLogger?.flush();
		const logs = this.logs;
		if (!fs.existsSync(this.outputDirectoryPath)) {
			fs.mkdirSync(this.outputDirectoryPath, { recursive: true });
		}
		// sort from most common column to least common
		// const schema = [...this.schema].sort((a, b) => b[1] - a[1]).map((v) => v[0]);
		// const data = logs.reduce(
		// 	(file, event) =>
		// 		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		// 		`${file}\n${schema.reduce((line, k) => `${line}${event[k] ?? ""},`, "")}`,
		// 	schema.join(","),
		// );
		const data = logs.map((x) => JSON.stringify(x)).join("\n");
		const filePath = `${this.outputDirectoryPath}/${this.fileNamePrefix}_${Date.now()}.csv`;
		fs.writeFileSync(filePath, data);
		// this.schema.clear();
		this.logs = [];
	}
	send(event: ITelemetryBaseEvent): void {
		this.baseLogger?.send(event);

		event.Event_Time = Date.now();
		// keep track of the frequency of every log event, as we'll sort by most common on write
		// Object.keys(event).forEach((k) => this.schema.set(k, (this.schema.get(k) ?? 0) + 1));
		this.logs.push(event);
	}
}

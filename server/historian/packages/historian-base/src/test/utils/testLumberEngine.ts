/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ILumberjackEngine,
	LogLevel,
	Lumber,
	LumberType,
} from "@fluidframework/server-services-telemetry";

/**
 * Lumberjack Engine that prints to stdout and stderr. Useful as a replacement to {@link TestEngine1}
 * when trying to debug tests.
 */
export class ConsoleDebugLumberjackEngine implements ILumberjackEngine {
	public emit(lumber: Lumber<string>) {
		try {
			const propObj: { [key: string]: any } = {};
			lumber.properties.forEach((value, key) => {
				propObj[key] = value;
			});
			const obj = {
				eventName: lumber.eventName,
				id: lumber.id,
				properties: JSON.stringify(propObj),
				type: LumberType[lumber.type],
				timestamp: new Date(lumber.timestamp).toISOString(),
				durationInMs: lumber.durationInMs,
				successful: lumber.successful,
				exception:
					typeof lumber.exception?.toString === "function"
						? `${lumber.exception}`
						: JSON.stringify(lumber.exception),
			};

			const message = lumber.message ?? "No message provided.";

			this.log(lumber.logLevel, message, obj);
		} catch (err) {
			this.log(
				LogLevel.Error,
				`WinstonLumberjackEngine: error when emitting Lumber object`,
				err,
			);
		}
	}

	private log(level: LogLevel, message: string, obj: unknown) {
		process[level === LogLevel.Error ? "stderr" : "stdout"].write(
			`[${this.getLogLevelToNameMapping(level).toUpperCase()}] ${message} ${JSON.stringify(
				obj,
			)}\n`,
		);
	}

	private getLogLevelToNameMapping(level: LogLevel | undefined) {
		switch (level) {
			case LogLevel.Error:
				return "error";
			case LogLevel.Warning:
				return "warn";
			case LogLevel.Info:
				return "info";
			case LogLevel.Verbose:
				return "verbose";
			case LogLevel.Debug:
				return "debug";
			default:
				return "info";
		}
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import safeStringify from "json-stringify-safe";
import { v4 as uuid } from "uuid";
import { LumberEventName } from "./lumberEventNames";
import {
	LogLevel,
	LumberType,
	ILumberjackEngine,
	ILumberjackSchemaValidator,
	handleError,
	ILumberFormatter,
} from "./resources";

// Lumber represents the telemetry data being captured, and it uses a list of
// ILumberjackEngine to emit the data according to the engine implementation.
// Lumber should be created through Lumberjack. Additional properties can be set through
// setProperty(). Once the telemetry event is complete, the user must call either success()
// or error() on Lumber to emit the data.
/**
 * @internal
 */
export class Lumber<T extends string = LumberEventName> {
	private readonly _startTime = performance.now();
	private _properties = new Map<string, any>();
	private _durationInMs?: number;
	private _successful?: boolean;
	private _message?: string;
	private _exception?: Error;
	private _logLevel?: LogLevel;
	private _completed = false;
	public readonly timestamp = Date.now();
	public readonly id = uuid();

	public get properties(): Map<string, any> {
		return this._properties;
	}

	public get durationInMs(): number | undefined {
		if (this.type === LumberType.Log) {
			return undefined;
		}
		return this._durationInMs;
	}

	public get successful(): boolean | undefined {
		if (this.type === LumberType.Log) {
			return undefined;
		}
		return this._successful;
	}

	public get message(): string | undefined {
		return this._message;
	}

	public get exception(): Error | undefined {
		return this._exception;
	}

	public get logLevel(): LogLevel | undefined {
		return this._logLevel;
	}

	constructor(
		public readonly eventName: T,
		public readonly type: LumberType,
		private readonly _engineList: ILumberjackEngine[],
		private readonly _schemaValidators?: ILumberjackSchemaValidator[],
		properties?: Map<string, any> | Record<string, any>,
		private readonly _formatters?: ILumberFormatter[],
	) {
		if (properties) {
			this.setProperties(properties);
		}
	}

	public setProperty(key: string, value: any): this {
		this._properties.set(key, value);
		return this;
	}

	public setProperties(properties: Map<string, any> | Record<string, any>): this {
		if (properties instanceof Map) {
			if (this._properties.size === 0) {
				this._properties = new Map(properties);
			} else {
				properties.forEach((value: any, key: string) => {
					this.setProperty(key, value);
				});
			}
		} else {
			Object.entries(properties).forEach((entry) => {
				const [key, value] = entry;
				this.setProperty(key, value);
			});
		}
		return this;
	}

	public success(message: string, logLevel: LogLevel = LogLevel.Info) {
		this.emit(message, logLevel, true, undefined);
	}

	public error(message: string, exception?: any, logLevel: LogLevel = LogLevel.Error) {
		this.emit(message, logLevel, false, exception);
	}

	public isCompleted(): boolean {
		return this._completed;
	}

	private emit(
		message: string,
		logLevel: LogLevel,
		successful: boolean,
		exception: any | undefined,
	) {
		if (this._completed) {
			handleError(
				LumberEventName.LumberjackError,
				`Trying to complete a Lumber telemetry operation that has alredy been completed.\
                [eventName: ${this.eventName}][id: ${this.id}]`,
				this._engineList,
			);
			return;
		}

		if (this._schemaValidators) {
			for (const schemaValidator of this._schemaValidators) {
				const validation = schemaValidator.validate(this.properties);
				if (!validation.validationPassed) {
					handleError(
						LumberEventName.LumberjackSchemaValidationFailure,
						`Schema validation failed for props: ${validation.validationFailedForProperties.toString()}.\
                        [eventName: ${this.eventName}][id: ${this.id}]`,
						this._engineList,
					);
				}
			}
		}

		this._message = message;
		this._logLevel = logLevel;
		this._successful = successful;

		if (exception instanceof Error) {
			this._exception = exception;
		} else if (exception !== undefined) {
			// We want to log the exception even if its value is `false`
			this._exception = new Error(safeStringify(exception));
		}

		const durationOverwrite = parseFloat(this.properties.get("durationInMs"));
		this._durationInMs = isNaN(durationOverwrite)
			? performance.now() - this._startTime
			: durationOverwrite;

		if (this._formatters) {
			this._formatters.forEach((formatter) => formatter.transform(this));
		}

		this._engineList.forEach((engine) => engine.emit(this));
		this._completed = true;
	}
}

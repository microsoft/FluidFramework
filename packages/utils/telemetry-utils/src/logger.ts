/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { performanceNow } from "@fluid-internal/client-utils";
import {
	type ITelemetryBaseEvent,
	type ITelemetryBaseLogger,
	LogLevel,
	type Tagged,
	type TelemetryBaseEventPropertyType,
} from "@fluidframework/core-interfaces";

import {
	CachedConfigProvider,
	loggerIsMonitoringContext,
	mixinMonitoringContext,
} from "./config.js";
import {
	extractLogSafeErrorProperties,
	generateStack,
	isILoggingError,
	isTaggedTelemetryPropertyValue,
} from "./errorLogging.js";
import type {
	ITelemetryErrorEventExt,
	ITelemetryEventExt,
	ITelemetryGenericEventExt,
	ITelemetryLoggerExt,
	ITelemetryPerformanceEventExt,
	ITelemetryPropertiesExt,
	TelemetryEventCategory,
	TelemetryEventPropertyTypeExt,
} from "./telemetryTypes.js";

/**
 * Broad classifications to be applied to individual properties as they're prepared to be logged to telemetry.
 *
 * @privateRemarks Please do not modify existing entries, to maintain backwards compatibility.
 *
 * @internal
 */
export enum TelemetryDataTag {
	/**
	 * Data containing terms or IDs from code packages that may have been dynamically loaded
	 */
	CodeArtifact = "CodeArtifact",
	/**
	 * Personal data of a variety of classifications that pertains to the user
	 */
	UserData = "UserData",
}

/**
 * @legacy
 * @alpha
 */
export type TelemetryEventPropertyTypes = ITelemetryPropertiesExt[string];

/**
 * @legacy
 * @alpha
 */
export type ITelemetryLoggerPropertyBag = Record<
	string,
	TelemetryEventPropertyTypes | (() => TelemetryEventPropertyTypes)
>;

/**
 * @legacy
 * @alpha
 */
export interface ITelemetryLoggerPropertyBags {
	all?: ITelemetryLoggerPropertyBag;
	error?: ITelemetryLoggerPropertyBag;
}

/**
 * Attempts to parse number from string.
 * If it fails, it will return the original string.
 *
 * @remarks
 * Used to make telemetry data typed (and support math operations, like comparison),
 * in places where we do expect numbers (like contentsize/duration property in http header).
 *
 * @internal
 */
// eslint-disable-next-line @rushstack/no-new-null
export function numberFromString(str: string | null | undefined): string | number | undefined {
	if (str === undefined || str === null) {
		return undefined;
	}
	const num = Number(str);
	return Number.isNaN(num) ? str : num;
}

// TODO: add docs
// eslint-disable-next-line jsdoc/require-description
/**
 * @internal
 */
export function formatTick(tick: number): number {
	return Math.floor(tick);
}

/**
 * String used to concatenate the namespace of parent loggers and their child loggers.
 * @internal
 */
export const eventNamespaceSeparator = ":" as const;

/**
 * TelemetryLogger class contains various helper telemetry methods,
 * encoding in one place schemas for various types of Fluid telemetry events.
 * Creates sub-logger that appends properties to all events
 */
export abstract class TelemetryLogger implements ITelemetryLoggerExt {
	/**
	 * {@inheritDoc eventNamespaceSeparator}
	 */
	public static readonly eventNamespaceSeparator = eventNamespaceSeparator;

	public static sanitizePkgName(name: string): string {
		return name.replace("@", "").replace("/", "-");
	}

	/**
	 * Take an unknown error object and add the appropriate info from it to the event. Message and stack will be copied
	 * over from the error object, along with other telemetry properties if it's an ILoggingError.
	 * @param event - Event being logged
	 * @param error - Error to extract info from
	 * @param fetchStack - Whether to fetch the current callstack if error.stack is undefined
	 */
	public static prepareErrorObject(
		event: ITelemetryBaseEvent,
		error: unknown,
		fetchStack: boolean,
	): void {
		const { message, errorType, stack } = extractLogSafeErrorProperties(
			error,
			true /* sanitizeStack */,
		);
		// First, copy over error message, stack, and errorType directly (overwrite if present on event)
		event.stack = stack;
		event.error = message; // Note that the error message goes on the 'error' field
		event.errorType = errorType;

		if (isILoggingError(error)) {
			// Add any other telemetry properties from the LoggingError
			const telemetryProp = error.getTelemetryProperties();
			for (const key of Object.keys(telemetryProp)) {
				if (event[key] !== undefined) {
					// Don't overwrite existing properties on the event
					continue;
				}
				event[key] = telemetryProp[key];
			}
		}

		// Collect stack if we were not able to extract it from error
		if (event.stack === undefined && fetchStack) {
			event.stack = generateStack();
		}
	}

	public constructor(
		protected readonly namespace?: string,
		protected readonly properties?: ITelemetryLoggerPropertyBags,
	) {}

	/**
	 * Send an event with the logger
	 *
	 * @param event - the event to send
	 */
	public abstract send(event: ITelemetryBaseEvent, logLevel?: LogLevel): void;

	/**
	 * Send a telemetry event with the logger
	 *
	 * @param event - the event to send
	 * @param error - optional error object to log
	 * @param logLevel - optional level of the log. It category of event is set as error,
	 * then the logLevel will be upgraded to be an error.
	 */
	public sendTelemetryEvent(
		event: ITelemetryGenericEventExt,
		error?: unknown,
		logLevel: typeof LogLevel.verbose | typeof LogLevel.default = LogLevel.default,
	): void {
		this.sendTelemetryEventCore(
			{ ...event, category: event.category ?? "generic" },
			error,
			event.category === "error" ? LogLevel.error : logLevel,
		);
	}

	/**
	 * Send a telemetry event with the logger
	 *
	 * @param event - the event to send
	 * @param error - optional error object to log
	 * @param logLevel - optional level of the log.
	 */
	protected sendTelemetryEventCore(
		event: ITelemetryGenericEventExt & { category: TelemetryEventCategory },
		error?: unknown,
		logLevel?: LogLevel,
	): void {
		const newEvent = convertToBaseEvent(event);
		if (error !== undefined) {
			TelemetryLogger.prepareErrorObject(newEvent, error, false);
		}

		// Will include Nan & Infinity, but probably we do not care
		if (typeof newEvent.duration === "number") {
			newEvent.duration = formatTick(newEvent.duration);
		}

		this.send(newEvent, logLevel);
	}

	/**
	 * Send an error telemetry event with the logger
	 *
	 * @param event - the event to send
	 * @param error - optional error object to log
	 */
	public sendErrorEvent(event: ITelemetryErrorEventExt, error?: unknown): void {
		this.sendTelemetryEventCore(
			{
				// ensure the error field has some value,
				// this can and will be overridden by event, or error
				error: event.eventName,
				...event,
				category: "error",
			},
			error,
			LogLevel.error,
		);
	}

	/**
	 * Send a performance telemetry event with the logger
	 *
	 * @param event - Event to send
	 * @param error - optional error object to log
	 * @param logLevel - optional level of the log. It category of event is set as error,
	 * then the logLevel will be upgraded to be an error.
	 */
	public sendPerformanceEvent(
		event: ITelemetryPerformanceEventExt,
		error?: unknown,
		logLevel: typeof LogLevel.verbose | typeof LogLevel.default = LogLevel.default,
	): void {
		const perfEvent = {
			...event,
			category: event.category ?? "performance",
		};

		this.sendTelemetryEventCore(
			perfEvent,
			error,
			perfEvent.category === "error" ? LogLevel.error : logLevel,
		);
	}

	protected prepareEvent(event: ITelemetryBaseEvent): ITelemetryBaseEvent {
		const includeErrorProps = event.category === "error" || event.error !== undefined;
		const newEvent: ITelemetryBaseEvent = {
			...event,
		};
		if (this.namespace !== undefined) {
			newEvent.eventName = `${this.namespace}${TelemetryLogger.eventNamespaceSeparator}${newEvent.eventName}`;
		}
		return this.extendProperties(newEvent, includeErrorProps);
	}

	private extendProperties<
		T extends ITelemetryLoggerPropertyBag = ITelemetryLoggerPropertyBag,
	>(toExtend: T, includeErrorProps: boolean): T {
		const eventLike: ITelemetryLoggerPropertyBag = toExtend;
		if (this.properties) {
			const properties: (undefined | ITelemetryLoggerPropertyBag)[] = [];
			properties.push(this.properties.all);
			if (includeErrorProps) {
				properties.push(this.properties.error);
			}
			for (const props of properties) {
				if (props !== undefined) {
					for (const [key, getterOrValue] of Object.entries(props)) {
						if (eventLike[key] !== undefined) {
							continue;
						}
						// If this throws, hopefully it is handled elsewhere
						const value =
							typeof getterOrValue === "function" ? getterOrValue() : getterOrValue;
						if (value !== undefined) {
							eventLike[key] = value;
						}
					}
				}
			}
		}
		return toExtend;
	}
}

/**
 * @deprecated 0.56, remove TaggedLoggerAdapter once its usage is removed from
 * container-runtime. Issue: #8191
 * TaggedLoggerAdapter class can add tag handling to your logger.
 *
 * @internal
 */
export class TaggedLoggerAdapter implements ITelemetryBaseLogger {
	public constructor(private readonly logger: ITelemetryBaseLogger) {}

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#ITelemetryBaseLogger.send}
	 */
	public send(eventWithTagsMaybe: ITelemetryBaseEvent): void {
		const newEvent: ITelemetryBaseEvent = {
			category: eventWithTagsMaybe.category,
			eventName: eventWithTagsMaybe.eventName,
		};
		for (const [key, taggableProp] of Object.entries(eventWithTagsMaybe)) {
			const { value, tag } =
				typeof taggableProp === "object"
					? taggableProp
					: { value: taggableProp, tag: undefined };
			switch (tag) {
				case undefined: {
					// No tag means we can log plainly
					newEvent[key] = value;
					break;
				}
				case "PackageData": // For back-compat
				case TelemetryDataTag.CodeArtifact: {
					// For Microsoft applications, CodeArtifact is safe for now
					// (we don't load 3P code in 1P apps)
					newEvent[key] = value;
					break;
				}
				case TelemetryDataTag.UserData: {
					// Strip out anything tagged explicitly as UserData.
					// Alternate strategy would be to hash these props
					newEvent[key] = "REDACTED (UserData)";
					break;
				}
				default: {
					// If we encounter a tag we don't recognize
					// then we must assume we should scrub.
					newEvent[key] = "REDACTED (unknown tag)";
					break;
				}
			}
		}
		this.logger.send(newEvent);
	}
}

/**
 * Create a child logger based on the provided props object.
 *
 * @remarks
 * Passing in no props object (i.e. undefined) will return a logger that is effectively a no-op.
 *
 * @param props - logger is the base logger the child will log to after it's processing, namespace will be prefixed to all event names, properties are default properties that will be applied events.
 *
 * @legacy
 * @alpha
 */
export function createChildLogger(props?: {
	logger?: ITelemetryBaseLogger;
	namespace?: string;
	properties?: ITelemetryLoggerPropertyBags;
}): ITelemetryLoggerExt {
	return ChildLogger.create(props?.logger, props?.namespace, props?.properties);
}

/**
 * ChildLogger class contains various helper telemetry methods,
 * encoding in one place schemas for various types of Fluid telemetry events.
 * Creates sub-logger that appends properties to all events.
 */
export class ChildLogger extends TelemetryLogger {
	/**
	 * Create child logger
	 * @param baseLogger - Base logger to use to output events. If undefined, proper child logger
	 * is created, but it does not send telemetry events anywhere.
	 * @param namespace - Telemetry event name prefix to add to all events
	 * @param properties - Base properties to add to all events
	 */
	public static create(
		baseLogger?: ITelemetryBaseLogger,
		namespace?: string,
		properties?: ITelemetryLoggerPropertyBags,
	): TelemetryLogger {
		// if we are creating a child of a child, rather than nest, which will increase
		// the callstack overhead, just generate a new logger that includes everything from the previous
		if (baseLogger instanceof ChildLogger) {
			const combinedProperties: ITelemetryLoggerPropertyBags = {};
			for (const extendedProps of [baseLogger.properties, properties]) {
				if (extendedProps !== undefined) {
					if (extendedProps.all !== undefined) {
						combinedProperties.all = {
							...combinedProperties.all,
							...extendedProps.all,
						};
					}
					if (extendedProps.error !== undefined) {
						combinedProperties.error = {
							...combinedProperties.error,
							...extendedProps.error,
						};
					}
				}
			}

			const combinedNamespace =
				baseLogger.namespace === undefined
					? namespace
					: namespace === undefined
						? baseLogger.namespace
						: `${baseLogger.namespace}${TelemetryLogger.eventNamespaceSeparator}${namespace}`;

			const child = new ChildLogger(
				baseLogger.baseLogger,
				combinedNamespace,
				combinedProperties,
			);

			if (!loggerIsMonitoringContext(child) && loggerIsMonitoringContext(baseLogger)) {
				mixinMonitoringContext(child, baseLogger.config);
			}
			return child;
		}

		return new ChildLogger(baseLogger ?? { send(): void {} }, namespace, properties);
	}

	private constructor(
		protected readonly baseLogger: ITelemetryBaseLogger,
		namespace: string | undefined,
		properties: ITelemetryLoggerPropertyBags | undefined,
	) {
		super(namespace, properties);

		// propagate the monitoring context
		if (loggerIsMonitoringContext(baseLogger)) {
			mixinMonitoringContext(this, new CachedConfigProvider(this, baseLogger.config));
		}
	}

	public get minLogLevel(): LogLevel | undefined {
		return this.baseLogger.minLogLevel;
	}

	private shouldFilterOutEvent(event: ITelemetryBaseEvent, logLevel?: LogLevel): boolean {
		const eventLogLevel = logLevel ?? LogLevel.default;
		const configLogLevel = this.baseLogger.minLogLevel ?? LogLevel.default;
		// Filter out in case event log level is below what is wanted in config.
		return eventLogLevel < configLogLevel;
	}

	/**
	 * Send an event with the logger
	 *
	 * @param event - the event to send
	 */
	public send(event: ITelemetryBaseEvent, logLevel?: LogLevel): void {
		if (this.shouldFilterOutEvent(event, logLevel)) {
			return;
		}
		this.baseLogger.send(this.prepareEvent(event), logLevel);
	}
}

/**
 * Input properties for {@link createMultiSinkLogger}.
 *
 * @internal
 */
export interface MultiSinkLoggerProperties {
	/**
	 * Will be prefixed to all event names.
	 */
	namespace?: string;

	/**
	 * Default properties that will be applied to all events flowing through this logger.
	 */
	properties?: ITelemetryLoggerPropertyBags;

	/**
	 * The base loggers that this logger will forward the logs to, after it processes them.
	 */
	loggers?: (ITelemetryBaseLogger | undefined)[];

	/**
	 * If true, the logger will attempt to copy the custom properties (if they are of a known type, i.e. one from this package) of all the base loggers passed to it, to apply them itself to logs that flow through.
	 */
	tryInheritProperties?: true;
}

/**
 * Create a logger which logs to multiple other loggers based on the provided props object.
 *
 * @internal
 */
export function createMultiSinkLogger(props: MultiSinkLoggerProperties): ITelemetryLoggerExt {
	return new MultiSinkLogger(
		props.namespace,
		props.properties,
		props.loggers?.filter((l): l is ITelemetryBaseLogger => l !== undefined),
		props.tryInheritProperties,
	);
}

/**
 * Multi-sink logger
 * Takes multiple ITelemetryBaseLogger objects (sinks) and logs all events into each sink
 */
export class MultiSinkLogger extends TelemetryLogger {
	protected loggers: ITelemetryBaseLogger[];
	// This is minimum of minLlogLevel of all loggers.
	private _minLogLevelOfAllLoggers: LogLevel;

	/**
	 * Create multiple sink logger (i.e. logger that sends events to multiple sinks)
	 * @param namespace - Telemetry event name prefix to add to all events
	 * @param properties - Base properties to add to all events
	 * @param loggers - The list of loggers to use as sinks
	 * @param tryInheritProperties - Will attempted to copy those loggers properties to this loggers if they are of a known type e.g. one from this package
	 */
	public constructor(
		namespace?: string,
		properties?: ITelemetryLoggerPropertyBags,
		loggers: ITelemetryBaseLogger[] = [],
		tryInheritProperties?: true,
	) {
		let realProperties = properties === undefined ? undefined : { ...properties };
		if (tryInheritProperties === true) {
			const merge = (realProperties ??= {});
			loggers
				.filter((l): l is this => l instanceof TelemetryLogger)
				.map((l) => l.properties ?? {})
				// eslint-disable-next-line unicorn/no-array-for-each
				.forEach((cv) => {
					// eslint-disable-next-line unicorn/no-array-for-each
					Object.keys(cv).forEach((k) => {
						// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
						merge[k] = { ...cv[k], ...merge?.[k] };
					});
				});
		}

		super(namespace, realProperties);
		this.loggers = loggers;
		this._minLogLevelOfAllLoggers = LogLevel.default;
		this.calculateMinLogLevel();
	}

	public get minLogLevel(): LogLevel {
		return this._minLogLevelOfAllLoggers;
	}

	private calculateMinLogLevel(): void {
		if (this.loggers.length > 0) {
			const logLevels: LogLevel[] = [];
			for (const logger of this.loggers) {
				logLevels.push(logger.minLogLevel ?? LogLevel.default);
			}
			this._minLogLevelOfAllLoggers = Math.min(...logLevels) as LogLevel;
		}
	}

	/**
	 * Add logger to send all events to
	 * @param logger - Logger to add
	 */
	public addLogger(logger?: ITelemetryBaseLogger): void {
		if (logger !== undefined && logger !== null) {
			this.loggers.push(logger);
			// Update in case the logLevel of added logger is less than the current.
			this.calculateMinLogLevel();
		}
	}

	/**
	 * Send an event to the loggers
	 *
	 * @param event - the event to send to all the registered logger
	 */
	public send(event: ITelemetryBaseEvent): void {
		const newEvent = this.prepareEvent(event);
		for (const logger of this.loggers) {
			logger.send(newEvent);
		}
	}
}

/**
 * Describes what events {@link PerformanceEvent} should log.
 *
 * @remarks
 * By default, all events are logged, but the client can override this behavior.
 *
 * For example, there is rarely a need to record a start event, as we're really after
 * success / failure tracking, including duration (on success).
 *
 * @internal
 */
export interface IPerformanceEventMarkers {
	start?: true;
	end?: true;
	cancel?: "generic" | "error"; // tells wether to issue "generic" or "error" category cancel event
}

/**
 * Helper class to log performance events.
 *
 * @internal
 */
export class PerformanceEvent {
	/**
	 * Creates an instance of {@link PerformanceEvent} and starts measurements
	 * @param logger - the logger to be used for publishing events
	 * @param event - the logging event details which will be published with the performance measurements
	 * @param markers - See {@link IPerformanceEventMarkers}
	 * @param recordHeapSize - whether or not to also record memory performance
	 * @param emitLogs - should this instance emit logs. If set to false, logs will not be emitted to the logger,
	 * but measurements will still be performed and any specified markers will be generated.
	 * @returns An instance of {@link PerformanceEvent}
	 */
	public static start(
		logger: ITelemetryLoggerExt,
		event: ITelemetryGenericEventExt,
		markers?: IPerformanceEventMarkers,
		emitLogs: boolean = true,
	): PerformanceEvent {
		return new PerformanceEvent(logger, event, markers, emitLogs);
	}

	/**
	 * Measure a synchronous task
	 * @param logger - the logger to be used for publishing events
	 * @param event - the logging event details which will be published with the performance measurements
	 * @param callback - the task to be executed and measured
	 * @param markers - See {@link IPerformanceEventMarkers}
	 * @param sampleThreshold - events with the same name and category will be sent to the logger
	 * only when we hit this many executions of the task. If unspecified, all events will be sent.
	 * @returns The results of the executed task
	 *
	 * @remarks Note that if the "same" event (category + eventName) would be emitted by different
	 * tasks (`callback`), `sampleThreshold` is still applied only based on the event's category + eventName,
	 * so executing either of the tasks will increase the internal counter and they
	 * effectively "share" the sampling rate for the event.
	 */
	public static timedExec<T>(
		logger: ITelemetryLoggerExt,
		event: ITelemetryGenericEventExt,
		callback: (event: PerformanceEvent) => T,
		markers?: IPerformanceEventMarkers,
		sampleThreshold: number = 1,
	): T {
		const perfEvent = PerformanceEvent.start(
			logger,
			event,
			markers,
			PerformanceEvent.shouldReport(event, sampleThreshold),
		);
		try {
			const ret = callback(perfEvent);
			perfEvent.autoEnd();
			return ret;
		} catch (error) {
			perfEvent.cancel(undefined, error);
			throw error;
		}
	}

	/**
	 * Measure an asynchronous task
	 * @param logger - the logger to be used for publishing events
	 * @param event - the logging event details which will be published with the performance measurements
	 * @param callback - the task to be executed and measured
	 * @param markers - See {@link IPerformanceEventMarkers}
	 * @param recordHeapSize - whether or not to also record memory performance
	 * @param sampleThreshold - events with the same name and category will be sent to the logger
	 * only when we hit this many executions of the task. If unspecified, all events will be sent.
	 * @returns The results of the executed task
	 *
	 * @remarks Note that if the "same" event (category + eventName) would be emitted by different
	 * tasks (`callback`), `sampleThreshold` is still applied only based on the event's category + eventName,
	 * so executing either of the tasks will increase the internal counter and they
	 * effectively "share" the sampling rate for the event.
	 */
	public static async timedExecAsync<T>(
		logger: ITelemetryLoggerExt,
		event: ITelemetryGenericEventExt,
		callback: (event: PerformanceEvent) => Promise<T>,
		markers?: IPerformanceEventMarkers,
		sampleThreshold: number = 1,
	): Promise<T> {
		const perfEvent = PerformanceEvent.start(
			logger,
			event,
			markers,
			PerformanceEvent.shouldReport(event, sampleThreshold),
		);
		try {
			const ret = await callback(perfEvent);
			perfEvent.autoEnd();
			return ret;
		} catch (error) {
			perfEvent.cancel(undefined, error);
			throw error;
		}
	}

	public get duration(): number {
		return performanceNow() - this.startTime;
	}

	private event?: ITelemetryGenericEventExt;
	private readonly startTime = performanceNow();
	private startMark?: string;

	protected constructor(
		private readonly logger: ITelemetryLoggerExt,
		event: ITelemetryGenericEventExt,
		private readonly markers: IPerformanceEventMarkers = { end: true, cancel: "generic" },
		private readonly emitLogs: boolean = true,
	) {
		this.event = { ...event };
		if (this.markers.start) {
			this.reportEvent("start");
		}

		if (
			typeof window === "object" &&
			window?.performance?.mark !== undefined &&
			window?.performance?.mark !== null
		) {
			this.startMark = `${event.eventName}-start`;
			window.performance.mark(this.startMark);
		}
	}

	public reportProgress(
		props?: ITelemetryPropertiesExt,
		eventNameSuffix: string = "update",
	): void {
		this.reportEvent(eventNameSuffix, props);
	}

	private autoEnd(): void {
		// Event might have been cancelled or ended in the callback
		if (this.event && this.markers.end) {
			this.reportEvent("end");
		}
		this.performanceEndMark();

		// To prevent the event from being reported again later
		this.event = undefined;
	}

	public end(props?: ITelemetryPropertiesExt): void {
		this.reportEvent("end", props);
		this.performanceEndMark();

		// To prevent the event from being reported again later
		this.event = undefined;
	}

	private performanceEndMark(): void {
		if (this.startMark !== undefined && this.event) {
			const endMark = `${this.event.eventName}-end`;
			window.performance.mark(endMark);
			window.performance.measure(`${this.event.eventName}`, this.startMark, endMark);
			this.startMark = undefined;
		}
	}

	public cancel(props?: ITelemetryPropertiesExt, error?: unknown): void {
		if (this.markers.cancel !== undefined) {
			this.reportEvent("cancel", { category: this.markers.cancel, ...props }, error);
		}

		// To prevent the event from being reported again later
		this.event = undefined;
	}

	/**
	 * Report the event, if it hasn't already been reported.
	 */
	public reportEvent(
		eventNameSuffix: string,
		props?: ITelemetryPropertiesExt,
		error?: unknown,
	): void {
		// If the caller invokes cancel or end directly inside the callback for timedExec[Async],
		// then it's possible to come back through reportEvent twice.  Only the first time counts.
		if (!this.event) {
			return;
		}

		if (!this.emitLogs) {
			return;
		}

		const event: ITelemetryPerformanceEventExt = { ...this.event, ...props };
		event.eventName = `${event.eventName}_${eventNameSuffix}`;
		if (eventNameSuffix !== "start") {
			event.duration = this.duration;
		}

		this.logger.sendPerformanceEvent(event, error);
	}

	private static readonly eventHits = new Map<string, number>();
	private static shouldReport(
		event: ITelemetryGenericEventExt,
		sampleThreshold: number,
	): boolean {
		const eventKey = `.${event.category}.${event.eventName}`;
		const hitCount = PerformanceEvent.eventHits.get(eventKey) ?? 0;
		PerformanceEvent.eventHits.set(eventKey, hitCount >= sampleThreshold ? 1 : hitCount + 1);
		return hitCount % sampleThreshold === 0;
	}
}

/**
 * Takes in an event object, and converts all of its values to a basePropertyType.
 * In the case of an invalid property type, the value will be converted to an error string.
 * @param event - Event with fields you want to stringify.
 */
function convertToBaseEvent({
	category,
	eventName,
	...props
}: ITelemetryEventExt): ITelemetryBaseEvent {
	const newEvent: ITelemetryBaseEvent = { category, eventName };
	for (const key of Object.keys(props)) {
		newEvent[key] = convertToBasePropertyType(props[key]);
	}
	return newEvent;
}

/**
 * Takes in value, and does one of 4 things.
 * if value is of primitive type - returns the original value.
 * If the value is a flat array or object - returns a stringified version of the array/object.
 * If the value is an object of type Tagged<TelemetryBaseEventPropertyType> - returns the object
 * with its values recursively converted to base property Type.
 * If none of these cases are reached - returns an error string
 * @param x - value passed in to convert to a base property type
 */
export function convertToBasePropertyType(
	x: TelemetryEventPropertyTypeExt | Tagged<TelemetryEventPropertyTypeExt>,
): TelemetryBaseEventPropertyType | Tagged<TelemetryBaseEventPropertyType> {
	return isTaggedTelemetryPropertyValue(x)
		? {
				value: convertToBasePropertyTypeUntagged(x.value),
				tag: x.tag,
			}
		: convertToBasePropertyTypeUntagged(x);
}

function convertToBasePropertyTypeUntagged(
	x: TelemetryEventPropertyTypeExt,
): TelemetryBaseEventPropertyType {
	switch (typeof x) {
		case "string":
		case "number":
		case "boolean":
		case "undefined": {
			return x;
		}
		case "object": {
			// We assume this is an array or flat object based on the input types
			return JSON.stringify(x);
		}
		default: {
			// should never reach this case based on the input types
			console.error(
				`convertToBasePropertyTypeUntagged: INVALID PROPERTY (typed as ${typeof x})`,
			);
			return `INVALID PROPERTY (typed as ${typeof x})`;
		}
	}
}

/**
 * Tags all given `values` with the same `tag`.
 *
 * @param tag - The tag with which all `values` will be annotated.
 * @param values - The values to be tagged.
 *
 * @remarks
 * It supports properties of type {@link @fluidframework/core-interfaces#TelemetryBaseEventPropertyType},
 * as well as callbacks that return that type.
 *
 * @example Sample usage
 * ```typescript
 * {
 * 	// ...Other properties being added to a telemetry event
 * 	...tagData("someTag", {foo: 1, bar: 2}),
 * 	// ...
 * }
 * ```
 * This will result in `foo` and `bar` added to the event with their values tagged.
 *
 * @internal
 */
export const tagData = <
	T extends TelemetryDataTag,
	V extends Record<
		string,
		TelemetryBaseEventPropertyType | (() => TelemetryBaseEventPropertyType)
	>,
>(
	tag: T,
	values: V,
): {
	[P in keyof V]:
		| (V[P] extends () => TelemetryBaseEventPropertyType
				? () => {
						value: ReturnType<V[P]>;
						tag: T;
					}
				: {
						value: Exclude<V[P], undefined>;
						tag: T;
					})
		| (V[P] extends undefined ? undefined : never);
} =>
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	Object.entries(values)
		.filter((e) => e[1] !== undefined)
		// eslint-disable-next-line unicorn/no-array-reduce
		.reduce((pv, cv) => {
			const [key, value] = cv;
			// The ternary form is less legible in this case.
			// eslint-disable-next-line unicorn/prefer-ternary
			if (typeof value === "function") {
				pv[key] = () => {
					return { tag, value: value() };
				};
			} else {
				pv[key] = { tag, value };
			}
			return pv;
		}, {}) as ReturnType<typeof tagData>;

/**
 * Tags all provided `values` as {@link TelemetryDataTag.CodeArtifact}.
 *
 * @param values - The values to be tagged.
 *
 * @remarks
 * It supports properties of type {@link @fluidframework/core-interfaces#TelemetryBaseEventPropertyType},
 * as well as callbacks that return that type.
 *
 * @example Sample usage
 * ```typescript
 * {
 * 	// ...Other properties being added to a telemetry event
 * 	...tagCodeArtifacts("someTag", {foo: 1, bar: 2}),
 * 	// ...
 * }
 * ```
 * This will result in `foo` and `bar` added to the event with their values tagged as {@link TelemetryDataTag.CodeArtifact}.
 *
 * @see {@link tagData}
 *
 * @internal
 */
export const tagCodeArtifacts = <
	T extends Record<
		string,
		TelemetryBaseEventPropertyType | (() => TelemetryBaseEventPropertyType)
	>,
>(
	values: T,
): {
	[P in keyof T]:
		| (T[P] extends () => TelemetryBaseEventPropertyType
				? () => {
						value: ReturnType<T[P]>;
						tag: TelemetryDataTag.CodeArtifact;
					}
				: {
						value: Exclude<T[P], undefined>;
						tag: TelemetryDataTag.CodeArtifact;
					})
		| (T[P] extends undefined ? undefined : never);
} => tagData<TelemetryDataTag.CodeArtifact, T>(TelemetryDataTag.CodeArtifact, values);

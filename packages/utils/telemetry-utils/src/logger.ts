/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
	ITelemetryErrorEvent,
	ITelemetryGenericEvent,
	ITelemetryPerformanceEvent,
	ITelemetryProperties,
	TelemetryBaseEventPropertyType as TelemetryEventPropertyType,
	LogLevel,
	Tagged,
	ITelemetryBaseProperties,
	TelemetryBaseEventPropertyType,
} from "@fluidframework/core-interfaces";
import { IsomorphicPerformance, performance } from "@fluid-internal/client-utils";
import { CachedConfigProvider, loggerIsMonitoringContext, mixinMonitoringContext } from "./config";
import {
	isILoggingError,
	extractLogSafeErrorProperties,
	generateStack,
	isTaggedTelemetryPropertyValue,
} from "./errorLogging";
import {
	ITelemetryEventExt,
	ITelemetryGenericEventExt,
	ITelemetryLoggerExt,
	ITelemetryPerformanceEventExt,
	TelemetryEventPropertyTypeExt,
	TelemetryEventCategory,
} from "./telemetryTypes";

export interface Memory {
	usedJSHeapSize: number;
}

export interface PerformanceWithMemory extends IsomorphicPerformance {
	readonly memory: Memory;
}
/**
 * Broad classifications to be applied to individual properties as they're prepared to be logged to telemetry.
 * Please do not modify existing entries for backwards compatibility.
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

export type TelemetryEventPropertyTypes = ITelemetryBaseProperties[string];

export interface ITelemetryLoggerPropertyBag {
	[index: string]: TelemetryEventPropertyTypes | (() => TelemetryEventPropertyTypes);
}
export interface ITelemetryLoggerPropertyBags {
	all?: ITelemetryLoggerPropertyBag;
	error?: ITelemetryLoggerPropertyBag;
}

/**
 * Attempts to parse number from string.
 * If fails,returns original string.
 * Used to make telemetry data typed (and support math operations, like comparison),
 * in places where we do expect numbers (like contentsize/duration property in http header)
 */
// eslint-disable-next-line @rushstack/no-new-null
export function numberFromString(str: string | null | undefined): string | number | undefined {
	if (str === undefined || str === null) {
		return undefined;
	}
	const num = Number(str);
	return Number.isNaN(num) ? str : num;
}

export function formatTick(tick: number): number {
	return Math.floor(tick);
}

export const eventNamespaceSeparator = ":" as const;

/**
 * TelemetryLogger class contains various helper telemetry methods,
 * encoding in one place schemas for various types of Fluid telemetry events.
 * Creates sub-logger that appends properties to all events
 */
export abstract class TelemetryLogger implements ITelemetryLoggerExt {
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
	public sendErrorEvent(event: ITelemetryErrorEvent, error?: unknown): void {
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

	private extendProperties<T extends ITelemetryLoggerPropertyBag = ITelemetryLoggerPropertyBag>(
		toExtend: T,
		includeErrorProps: boolean,
	): T {
		const eventLike: ITelemetryLoggerPropertyBag = toExtend;
		if (this.properties) {
			const properties: (undefined | ITelemetryLoggerPropertyBag)[] = [];
			properties.push(this.properties.all);
			if (includeErrorProps) {
				properties.push(this.properties.error);
			}
			for (const props of properties) {
				if (props !== undefined) {
					for (const key of Object.keys(props)) {
						if (eventLike[key] !== undefined) {
							continue;
						}
						const getterOrValue = props[key];
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
		for (const key of Object.keys(eventWithTagsMaybe)) {
			const taggableProp = eventWithTagsMaybe[key];
			const { value, tag } =
				typeof taggableProp === "object"
					? taggableProp
					: { value: taggableProp, tag: undefined };
			switch (tag) {
				case undefined:
					// No tag means we can log plainly
					newEvent[key] = value;
					break;
				case "PackageData": // For back-compat
				case TelemetryDataTag.CodeArtifact:
					// For Microsoft applications, CodeArtifact is safe for now
					// (we don't load 3P code in 1P apps)
					newEvent[key] = value;
					break;
				case TelemetryDataTag.UserData:
					// Strip out anything tagged explicitly as UserData.
					// Alternate strategy would be to hash these props
					newEvent[key] = "REDACTED (UserData)";
					break;
				default:
					// If we encounter a tag we don't recognize
					// then we must assume we should scrub.
					newEvent[key] = "REDACTED (unknown tag)";
					break;
			}
		}
		this.logger.send(newEvent);
	}
}

/**
 * Create a child logger based on the provided props object
 * @param props - logger is the base logger the child will log to after it's processing, namespace will be prefixed to all event names, properties are default properties that will be applied events.
 *
 * @remarks
 * Passing in no props object (i.e. undefined) will return a logger that is effectively a no-op.
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
 * Creates sub-logger that appends properties to all events
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

		return new ChildLogger(
			baseLogger ? baseLogger : { send(): void {} },
			namespace,
			properties,
		);
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
 * Create a logger which logs to multiple other loggers based on the provided props object
 * @param props - loggers are the base loggers that will logged to after it's processing, namespace will be prefixed to all event names, properties are default properties that will be applied events.
 * tryInheritProperties will attempted to copy those loggers properties to this loggers if they are of a known type e.g. one from this package
 */
export function createMultiSinkLogger(props: {
	namespace?: string;
	properties?: ITelemetryLoggerPropertyBags;
	loggers?: (ITelemetryBaseLogger | undefined)[];
	tryInheritProperties?: true;
}): ITelemetryLoggerExt {
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
	constructor(
		namespace?: string,
		properties?: ITelemetryLoggerPropertyBags,
		loggers: ITelemetryBaseLogger[] = [],
		tryInheritProperties?: true,
	) {
		let realProperties = properties !== undefined ? { ...properties } : undefined;
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
 * Describes what events PerformanceEvent should log
 * By default, all events are logged, but client can override this behavior
 * For example, there is rarely a need to record start event, as we really after
 * success / failure tracking, including duration (on success).
 */
export interface IPerformanceEventMarkers {
	start?: true;
	end?: true;
	cancel?: "generic" | "error"; // tells wether to issue "generic" or "error" category cancel event
}

/**
 * Helper class to log performance events
 */
export class PerformanceEvent {
	public static start(
		logger: ITelemetryLoggerExt,
		event: ITelemetryGenericEvent,
		markers?: IPerformanceEventMarkers,
		recordHeapSize: boolean = false,
	): PerformanceEvent {
		return new PerformanceEvent(logger, event, markers, recordHeapSize);
	}

	public static timedExec<T>(
		logger: ITelemetryLoggerExt,
		event: ITelemetryGenericEvent,
		callback: (event: PerformanceEvent) => T,
		markers?: IPerformanceEventMarkers,
	): T {
		const perfEvent = PerformanceEvent.start(logger, event, markers);
		try {
			const ret = callback(perfEvent);
			perfEvent.autoEnd();
			return ret;
		} catch (error) {
			perfEvent.cancel(undefined, error);
			throw error;
		}
	}

	public static async timedExecAsync<T>(
		logger: ITelemetryLoggerExt,
		event: ITelemetryGenericEvent,
		callback: (event: PerformanceEvent) => Promise<T>,
		markers?: IPerformanceEventMarkers,
		recordHeapSize?: boolean,
	): Promise<T> {
		const perfEvent = PerformanceEvent.start(logger, event, markers, recordHeapSize);
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
		return performance.now() - this.startTime;
	}

	private event?: ITelemetryGenericEvent;
	private readonly startTime = performance.now();
	private startMark?: string;
	private startMemoryCollection: number | undefined = 0;

	protected constructor(
		private readonly logger: ITelemetryLoggerExt,
		event: ITelemetryGenericEvent,
		private readonly markers: IPerformanceEventMarkers = { end: true, cancel: "generic" },
		private readonly recordHeapSize: boolean = false,
	) {
		this.event = { ...event };
		if (this.markers.start) {
			this.reportEvent("start");
		}

		// eslint-disable-next-line unicorn/no-null
		if (typeof window === "object" && window != null && window.performance?.mark) {
			this.startMark = `${event.eventName}-start`;
			window.performance.mark(this.startMark);
		}
	}

	public reportProgress(props?: ITelemetryProperties, eventNameSuffix: string = "update"): void {
		this.reportEvent(eventNameSuffix, props);
	}

	private autoEnd(): void {
		// Event might have been cancelled or ended in the callback
		if (this.event && this.markers.end) {
			this.reportEvent("end");
		}
		this.performanceEndMark();
		this.event = undefined;
	}

	public end(props?: ITelemetryProperties): void {
		this.reportEvent("end", props);
		this.performanceEndMark();
		this.event = undefined;
	}

	private performanceEndMark(): void {
		if (this.startMark && this.event) {
			const endMark = `${this.event.eventName}-end`;
			window.performance.mark(endMark);
			window.performance.measure(`${this.event.eventName}`, this.startMark, endMark);
			this.startMark = undefined;
		}
	}

	public cancel(props?: ITelemetryProperties, error?: unknown): void {
		if (this.markers.cancel !== undefined) {
			this.reportEvent("cancel", { category: this.markers.cancel, ...props }, error);
		}
		this.event = undefined;
	}

	/**
	 * Report the event, if it hasn't already been reported.
	 */
	public reportEvent(
		eventNameSuffix: string,
		props?: ITelemetryProperties,
		error?: unknown,
	): void {
		// There are strange sequences involving multiple Promise chains
		// where the event can be cancelled and then later a callback is invoked
		// and the caller attempts to end directly, e.g. issue #3936. Just return.
		if (!this.event) {
			return;
		}

		const event: ITelemetryPerformanceEvent = { ...this.event, ...props };
		event.eventName = `${event.eventName}_${eventNameSuffix}`;
		if (eventNameSuffix !== "start") {
			event.duration = this.duration;
			if (this.startMemoryCollection) {
				const currentMemory = (performance as PerformanceWithMemory)?.memory
					?.usedJSHeapSize;
				const differenceInKBytes = Math.floor(
					(currentMemory - this.startMemoryCollection) / 1024,
				);
				if (differenceInKBytes > 0) {
					event.usedJSHeapSize = differenceInKBytes;
				}
			}
		} else if (this.recordHeapSize) {
			this.startMemoryCollection = (
				performance as PerformanceWithMemory
			)?.memory?.usedJSHeapSize;
		}

		this.logger.sendPerformanceEvent(event, error);
	}
}

/**
 * Null logger that no-ops for all telemetry events passed to it.
 * @deprecated - This will be removed in a future release.
 * For internal use within the FluidFramework codebase, use {@link createChildLogger} with no arguments instead.
 * For external consumers we recommend writing a trivial implementation of {@link @fluidframework/core-interfaces#ITelemetryBaseLogger}
 * where the send() method does nothing and using that.
 */
export class TelemetryNullLogger implements ITelemetryLoggerExt {
	public send(event: ITelemetryBaseEvent): void {}
	public sendTelemetryEvent(event: ITelemetryGenericEvent, error?: unknown): void {}
	public sendErrorEvent(event: ITelemetryErrorEvent, error?: unknown): void {}
	public sendPerformanceEvent(event: ITelemetryPerformanceEvent, error?: unknown): void {}
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
 * If the value is an object of type Tagged<TelemetryEventPropertyType> - returns the object
 * with its values recursively converted to base property Type.
 * If none of these cases are reached - returns an error string
 * @param x - value passed in to convert to a base property type
 */
export function convertToBasePropertyType(
	x: TelemetryEventPropertyTypeExt | Tagged<TelemetryEventPropertyTypeExt>,
): TelemetryEventPropertyType | Tagged<TelemetryEventPropertyType> {
	return isTaggedTelemetryPropertyValue(x)
		? {
				value: convertToBasePropertyTypeUntagged(x.value),
				tag: x.tag,
		  }
		: convertToBasePropertyTypeUntagged(x);
}

function convertToBasePropertyTypeUntagged(
	x: TelemetryEventPropertyTypeExt,
): TelemetryEventPropertyType {
	switch (typeof x) {
		case "string":
		case "number":
		case "boolean":
		case "undefined":
			return x;
		case "object":
			// We assume this is an array or flat object based on the input types
			return JSON.stringify(x);
		default:
			// should never reach this case based on the input types
			console.error(
				`convertToBasePropertyTypeUntagged: INVALID PROPERTY (typed as ${typeof x})`,
			);
			return `INVALID PROPERTY (typed as ${typeof x})`;
	}
}

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
		// eslint-disable-next-line unicorn/no-array-reduce, unicorn/prefer-object-from-entries
		.reduce((pv, cv) => {
			const [key, value] = cv;
			if (typeof value === "function") {
				// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
				pv[key] = () => {
					return { tag, value: value() };
				};
			} else {
				pv[key] = { tag, value };
			}
			return pv;
		}, {}) as ReturnType<typeof tagData>;

/**
 * Helper function to tag telemetry properties as CodeArtifacts. It supports properties of type
 * TelemetryBaseEventPropertyType as well as getters that return TelemetryBaseEventPropertyType.
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

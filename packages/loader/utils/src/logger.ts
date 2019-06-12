import {
    ITelemetryBaseEvent,
    ITelemetryBaseLogger,
    ITelemetryErrorEvent,
    ITelemetryInformationalEvent,
    ITelemetryLogger,
    ITelemetryPerformanceEvent,
    TelemetryPerfType,
} from "@prague/container-definitions";
import * as registerDebug from "debug";
// tslint:disable-next-line:no-var-requires
const performanceNow = require("performance-now") as (() => number);

/**
 * Null logger
 * It can be used in places where logger instance is required, but events should be not send over.
 */
export class BaseTelemetryNullLogger implements ITelemetryBaseLogger {
    /**
     * Send an event with the logger
     *
     * @param event - the event to send
     */
    public send(event: ITelemetryBaseEvent): void {
        return;
    }
}

/**
 * TelemetryLogger class contains various helper telemetry methods,
 * encoding in one place schemas for various types of Prague telemetry events.
 * Creates sub-logger that appends properties to all events
 */
export abstract class TelemetryLogger implements ITelemetryLogger {
    public static readonly eventNamespaceSeparator = ":";

    public static FormatTick(tick: number): string {
        return tick.toFixed(0);
    }

    protected static prepareErrorObject(error: any): any {
        if (typeof error !== "object") {
            // tslint:disable-next-line:no-unsafe-any
            return error;
        }

        // Exceptions have these properties:
        // - JSON.stringify() produces empty object output ("{}")
        // - toString() prints error message, but without useful stack
        // - there are non-enumerable properties on exception object that we can tap on
        //   (but no guarantee they will be there in future or different environments)
        // Solution:
        //   Copy all non-enumerable own properties (i.e. we are not walking prototype chain)
        const errorAsObject: object = error as object;
        const error2: object = {...errorAsObject};
        Object.getOwnPropertyNames(errorAsObject).forEach((prop: string) => {
            error2[prop] = errorAsObject[prop];
        });

        return error2;
    }

    protected constructor(
        private readonly namespace?: string,
        private readonly properties?: object) {
    }

    /**
     * Send an event with the logger
     *
     * @param event - the event to send
     */
    public abstract send(event: ITelemetryBaseEvent): void;

    /**
     * Send a telemetry event with the logger
     *
     * @param event - the event to send
     */
    public sendTelemetryEvent(event: ITelemetryInformationalEvent) {
        this.send({ ...event, category: "telemetryEvent" });
    }

    /**
     * Send am error event with the logger
     *
     * @param event - the event to send
     */
    public sendErrorEvent(event: ITelemetryErrorEvent) {
        this.send({ ...event, category: "error" });
    }

    /**
     * Send error telemetry event
     * @param event - Event to send
     */
    public sendPerformanceEvent(event: ITelemetryPerformanceEvent): void {
        const perfEvent: ITelemetryBaseEvent = { ...event, category: "performance" };

        if (event.duration) {
            perfEvent.duration = TelemetryLogger.FormatTick(event.duration);
        }
        const tick = event.tick ? event.tick : performanceNow();
        perfEvent.tick = TelemetryLogger.FormatTick(tick);

        this.send(perfEvent);
    }

    /**
     * Log generic error with the logger
     *
     * @param eventName - the name of the event
     * @param error - the error object to include in the event, require to be JSON-able
     */
    public logGenericError(eventName: string, error: any) {
        // tslint:disable-next-line:no-unsafe-any
        this.sendErrorEvent({ eventName, error: TelemetryLogger.prepareErrorObject(error) });
    }

    /**
     * Helper method to log exceptions
     * @param event - the event to send
     * @param exception - Exception object to add to an event
     */
    public logException(event: ITelemetryErrorEvent, exception: any): void {
        // tslint:disable-next-line:no-unsafe-any
        this.sendErrorEvent({ ...event, isException: true, error: TelemetryLogger.prepareErrorObject(exception) });
    }

    /**
     * Log an debug assert with the logger
     *
     * @param condition - the condition to assert on
     * @param exception - the message to log if the condition fails
     */
    public debugAssert(condition: boolean, message: string): void {
        this.shipAssert(condition, message);
    }

    /**
     * Log an ship assert with the logger
     *
     * @param condition - the condition to assert on
     * @param exception - the message to log if the condition fails
     */
    public shipAssert(condition: boolean, message: string): void {
        if (!condition) {
            this.sendErrorEvent({ eventName: "Assert", message });
        }
    }

    protected prepareEvent(event: ITelemetryBaseEvent): ITelemetryBaseEvent {
        const newEvent = { ...this.properties, ...event };
        if (this.namespace !== undefined) {
            newEvent.eventName = `${this.namespace}${TelemetryLogger.eventNamespaceSeparator}${newEvent.eventName}`;
        }

        return newEvent;
    }
}

/**
 * ChildLogger class contains various helper telemetry methods,
 * encoding in one place schemas for various types of Prague telemetry events.
 * Creates sub-logger that appends properties to all events
 */
export class ChildLogger extends TelemetryLogger {
    /**
     * Create child logger
     * @param baseLogger - Base logger to use to output events. If undefined, proper child logger
     * is created, but it does not sends telemetry events anywhere.
     * @param namespace - Telemetry event name prefix to add to all events
     * @param properties - Base properties to add to all events
     */
    public static Create(
        baseLogger?: ITelemetryBaseLogger,
        namespace?: string,
        properties?: object): TelemetryLogger {

        return new ChildLogger(
            baseLogger ? baseLogger : new BaseTelemetryNullLogger(),
            namespace,
            properties);
    }

    constructor(
        protected readonly logger: ITelemetryBaseLogger,
        namespace?: string,
        properties?: object) {
        super(namespace, properties);
    }

    /**
     * Send an event with the logger
     *
     * @param event - the event to send
     */
    public send(event: ITelemetryBaseEvent): void {
        this.logger.send(this.prepareEvent(event));
    }
}

/**
 * Multi-sink logger
 * Takes multiple ITelemetryBaseLogger objects (sinks) and logs all events into each sink
 * Implements ITelemetryBaseLogger (through static Create() method)
 */
export class MultiSinkLogger extends TelemetryLogger {
    protected loggers: ITelemetryBaseLogger[] = new Array<ITelemetryBaseLogger>();

    /**
     * Create multiple sink logger (i.e. logger that sends events to multiple sinks)
     * @param namespace - Telemetry event name prefix to add to all events
     * @param properties - Base properties to add to all events
     */
    constructor(namespace?: string, properties?: object) {
        super(namespace, properties);
    }

    /**
     * Add logger to send all events to
     * @param logger - Logger to add
     */
    public addLogger(logger?: ITelemetryBaseLogger) {
        if (logger !== undefined && logger !== null) {
            this.loggers.push(logger);
        }
    }

    /**
     * Send an event to the loggers
     *
     * @param event - the event to send to all the registered logger
     */
    public send(event: ITelemetryBaseEvent): void {
        const newEvent = this.prepareEvent(event);
        this.loggers.forEach((logger: ITelemetryBaseLogger) => {
            logger.send(newEvent);
        });
    }
}

/**
 * Implementation of debug logger
 */
export class DebugLogger extends TelemetryLogger {
    /**
     * Create debug logger - all events are output to debug npm library
     * @param namespace - Telemetry event name prefix to add to all events
     * @param properties - Base properties to add to all events
     */
    public static Create(namespace: string, properties?: object): TelemetryLogger {
        // setup base logger upfront, such that host can disable it (if needed)
        const debug = registerDebug(namespace);
        debug.enabled = true;

        const debugErr = registerDebug(namespace);
        debugErr.log = console.error.bind(console);
        debugErr.enabled = true;

        return new DebugLogger(debug, debugErr, properties);
    }

    /**
     * Mix in debug logger with another logger.
     * Returned logger will output events to both newly created debug logger, as well as base logger
     * @param namespace - Telemetry event name prefix to add to all events
     * @param properties - Base properties to add to all events
     * @param baseLogger - Base logger to output events (in addition to debug logger being created). Can be undefined.
     */
    public static MixinDebugLogger(
        namespace: string,
        properties?: object,
        baseLogger?: ITelemetryBaseLogger): TelemetryLogger {
        const debugLogger = DebugLogger.Create(namespace, properties);
        if (!baseLogger) {
            return debugLogger;
        }
        const multiSinkLogger = new MultiSinkLogger();
        multiSinkLogger.addLogger(debugLogger);
        multiSinkLogger.addLogger(ChildLogger.Create(baseLogger, namespace, properties));

        return multiSinkLogger;
    }

    constructor(
        private readonly debug: registerDebug.IDebugger,
        private readonly debugErr: registerDebug.IDebugger,
        properties?: object,
    ) {
        super(undefined, properties);
    }

    /**
     * Send an event to debug loggers
     *
     * @param event - the event to send
     */
    public send(event: ITelemetryBaseEvent): void {
        const newEvent = this.prepareEvent(event);
        let logger = newEvent.category === "error" ? this.debugErr : this.debug;

        // Use debug's coloring schema for base of the event
        const index = newEvent.eventName.lastIndexOf(TelemetryLogger.eventNamespaceSeparator);
        const name = newEvent.eventName.substring(index + 1);
        if (index > 0) {
            logger = logger.extend(newEvent.eventName.substring(0, index));
        }

        // Filter out event name and category from json payload
        const payload = JSON.stringify(newEvent, (k, v) => {
            return (k !== "eventName") ? v : undefined;
        });

        logger(payload === "{}" ? name : `${name} ${payload}`);
    }
}

/**
 * Helper class to log performance events
 */
export class PerformanceEvent {
    public static Start(logger: ITelemetryLogger, event: ITelemetryInformationalEvent) {
        return new PerformanceEvent(logger, event);
    }

    private event?: ITelemetryInformationalEvent;
    private readonly startTime = performanceNow();

    protected constructor(
            private readonly logger: ITelemetryLogger,
            event: ITelemetryInformationalEvent) {
        this.event = {...event, tick: this.startTime};
        this.reportEvent("start");
    }

    public reportProgress(props?: object): void {
        this.reportEvent("progress", props);
    }

    public end(props?: object): void {
        this.reportEvent("end", props);
        this.event = undefined;
    }

    public cancel(props?: object): void {
        this.reportEvent("cancel", props);
        this.event = undefined;
    }

    public reportEvent(perfType: TelemetryPerfType, props?: object): void {
        if (!this.event) {
            this.logger.sendErrorEvent({
                eventName: "PerformanceEventAfterStop",
                perfEventName: this.event!.eventName,
                perfType,
            });
            return;
        }

        const tick = performanceNow();
        const event: ITelemetryPerformanceEvent = {...this.event, ...props, perfType, tick};
        if (perfType !== "start") {
            event.duration = tick - this.startTime;
        }

        this.logger.sendPerformanceEvent(event);
    }
}

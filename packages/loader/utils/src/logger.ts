import {
    ITelemetryBaseEvent,
    ITelemetryBaseLogger,
    ITelemetryErrorEvent,
    ITelemetryInformationalEvent,
    ITelemetryLogger,
} from "@prague/container-definitions";
import * as registerDebug from "debug";

/**
 * Null logger
 * It can be used in places where logger instance is required, but events should be not send over.
 */
export class BaseTelemetryNullLogger implements ITelemetryBaseLogger {
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
    protected constructor(
        private readonly namespace?: string,
        private readonly properties?: object) {
    }

    public abstract send(event: ITelemetryBaseEvent): void;

    public sendTelemetryEvent(event: ITelemetryInformationalEvent) {
        this.send({...event, category: "telemetryEvent"});
    }

    public sendError(event: ITelemetryErrorEvent) {
        this.send({...event, category: "error"});
    }

    public logException(eventName: string, exception: any) {
        this.sendError({eventName, exception: JSON.stringify(exception)});
    }

    public debugAssert(condition: boolean, message: string): void {
        this.shipAssert(condition, message);
    }

    public shipAssert(condition: boolean, message: string): void {
        if (!condition) {
            this.sendError({eventName: "Assert", message});
        }
    }

    protected prepareEvent(event: ITelemetryBaseEvent): ITelemetryBaseEvent {
        const newEvent = {...this.properties, ...event};
        if (this.namespace !== undefined) {
            newEvent.eventName = `${this.namespace}:${newEvent.eventName}`;
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
    public static Create(baseLogger?: ITelemetryBaseLogger,
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

    public send(event: ITelemetryBaseEvent): void {
        const newEvent = this.prepareEvent(event);
        let logger = newEvent.category === "error" ? this.debugErr : this.debug;

        // Use debug's coloring schema for base of the event
        const index = newEvent.eventName.lastIndexOf(":");
        const name = newEvent.eventName.substring(index + 1);
        if (index > 0) {
            logger = logger.extend(newEvent.eventName.substring(0, index));
        }

        // Filter out event name and category from json payload
        const payload = JSON.stringify(newEvent, (k, v) => {
            return (k !== "eventName" && k !== "category") ? v : undefined;
        });

        logger(payload === "{}" ? name : `${name} ${payload}`);
    }
}

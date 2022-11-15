/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import {
    ITelemetryGenApiEvent,
    ITelemetryGenClassEvent,
    ITelemetryGenErrorEvent,
    ITelemetryGenServiceEvent,
    ITelemetryGenEvent,
    ITelemetryLogger,
    TelemetryErrorCategory,
} from "@fluidframework/common-definitions";


export interface IClassEventConfig {
    docId?: string;
    clientId?: string;
    details?: any;
}

export interface IApiEventConfig {
    apiName: string;
    docId?: string;
    clientId?: string;
    details?: any;
}

export interface IErrorEventConfig {
    errorCode: string;
    docId?: string;
    clientId?: string;
    detastackTraceils?: any;
    details?: any;
    severityLevel: TelemetryErrorCategory;
    message?: string;
}

export interface IServiceEventConfig {
    target: string;
    docId?: string;
    clientId?: string;
    details?: any;
}

/**
 * Helper class for general-use logs
 */
export class GeneralUseLogger {
    private readonly baseEventData;

    public constructor(
        private readonly packageName: string,
        private readonly className: string,
        private readonly logger: ITelemetryLogger
    ) {
        this.baseEventData = {
            genUse: true,
            packageName: this.packageName,
            className: this.className,
        };
    }

    public async logApiCall<T>(
        eventName: string,
        eventData: IApiEventConfig,
        callback: (event: ITelemetryGenApiEvent) => Promise<T>,
    ) {
        const event: ITelemetryGenApiEvent = {
            type: "api",
            eventName,
            category: "performance",
            success: false,
            id: uuid(),
            duration: 0,
            ...this.baseEventData,
            ...eventData,
        };

        const startMark = `${event.eventName}-start`;
        this.performanceStart({ ...event }, startMark);

        try {
            const startTime = performance.now();
            const ret = await callback(event);
            event.duration = this.duration(startTime);
            this.performanceEnd({ ...event }, startMark);
            event.success = true;
            return ret;
        } catch (error) {
            this.performanceCancel(event);
            throw error;
        }
    }

    public async logServiceCall<T>(
        eventName: string,
        eventData: IServiceEventConfig,
        callback: (event: ITelemetryGenServiceEvent) => Promise<T>,
    ) {
        const event: ITelemetryGenServiceEvent = {
            type: "service",
            eventName,
            category: "performance",
            success: false,
            id: uuid(),
            duration: 0,
            resultCode: "unknown",
            ...this.baseEventData,
            ...eventData,
        };

        const startMark = `${event.eventName}-start`;
        this.performanceStart({ ...event }, startMark);

        try {
            const startTime = performance.now();
            const ret = await callback(event);
            event.duration = this.duration(startTime);
            this.performanceEnd({ ...event }, startMark);
            event.success = true;
            return ret;
        } catch (error) {
            this.performanceCancel(event);
            throw error;
        }
    }

    public logError(
        eventName: string,
        eventData: IErrorEventConfig,
    ) {
        const event: ITelemetryGenErrorEvent = {
            type: "error",
            eventName,
            category: "error",
            ...this.baseEventData,
            ...eventData
        };
        this.reportEvent(event);
    }

    public logEvent(
        eventName: string,
        eventData?: IClassEventConfig,
    ) {
        const event: ITelemetryGenClassEvent = {
            type: "event",
            eventName,
            category: "general",
            ...this.baseEventData,
            ...eventData
        };
        this.reportEvent(event);
    }

    private duration(startTime: number) {
        return performance.now() - startTime;
    }

    private performanceStart(event: ITelemetryGenEvent, startMark: string) {
        this.reportEvent(event, "start");
        if (
            typeof window === "object" &&
            window != null &&
            window.performance
        ) {
            window.performance.mark(startMark);
        }
    }

    private performanceEnd(event: ITelemetryGenEvent, startMark: string) {
        this.reportEvent(event, "end");
        if (
            typeof window === "object" &&
            window != null &&
            window.performance
        ) {
            const endMark = `${event.eventName}-end`;
            window.performance.mark(endMark);
            window.performance.measure(
                `${event.eventName}`,
                startMark,
                endMark
            );
        }
    }

    private performanceCancel(event: ITelemetryGenEvent) {
        this.reportEvent(event, "cancel");
    }

    /**
     * Report the event, if it hasn't already been reported.
     */
    private reportEvent(event: ITelemetryGenEvent, eventNameSuffix?: string) {
        if (eventNameSuffix) {
            event.eventName = `${event.eventName}_${eventNameSuffix}`;
        }
        this.logger.sendGenTelemetry?.(event);
    }
}

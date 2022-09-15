/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryProperties } from "@fluidframework/common-definitions";
import { ICriticalContainerError } from "@fluidframework/container-definitions";

import {
    IConfigProvider,
    IFluidErrorBase,
    LoggingError,
    MonitoringContext,
} from "@fluidframework/telemetry-utils";
import { oneDayMs } from "./garbageCollection";

/**
 * Feature gate key to enable closing the container if SweepReady objects are used.
 * Only known values are accepted, otherwise return undefined.
 *
 * mainContainer: Detect these errors only in the main container
 */
const sweepReadyUsageDetectionSetting = {
    read(config: IConfigProvider) {
        const sweepReadyUsageDetectionKey = "Fluid.GarbageCollection.Dogfood.SweepReadyUsageDetection";
        const value = config.getString(sweepReadyUsageDetectionKey);
        if (value === undefined) {
            return { mainContainer: false, summarizer: false };
        }
        return {
            mainContainer: value.indexOf("mainContainer") >= 0,
            summarizer: value.indexOf("summarizer") >= 0,
        };
    },
};

const blackoutPeriodDays = "Fluid.GarbageCollection.Dogfood.SweepReadyUsageDetection.ThrottlingDurationDays";
const closuresStorageKey = "Fluid.GarbageCollection.Dogfood.SweepReadyUsageDetection.Closures";

/**
 * Error class raised when a SweepReady object is used, indicating a bug in how
 * references are managed in the container by the application, or a bug in how
 * GC tracks those references.
 *
 * There's a chance for false positives when this error is raised by a Main Container,
 * since only the Summarizer has the latest truth about unreferenced node tracking
 */
export class SweepReadyUsageError extends LoggingError implements IFluidErrorBase {
    /** This errorType will be in temporary use (until Sweep is fully implemented) so don't add to any errorType type */
    public errorType: string = "objectUsedAfterMarkedForDeletionError";
}

export class SweepReadyUsageDetectionHandler {
    private readonly storage: Pick<Storage, "getItem" | "setItem">;
    constructor(
        /** Unique key for this container for diagnostic purposes */
        private readonly uniqueContainerKey: string,
        private readonly mc: MonitoringContext,
        localStorageImpl: Pick<Storage, "getItem" | "setItem"> | undefined,
        private readonly closeFn: (error?: ICriticalContainerError) => void,
    ) {
        const noopStorage = { getItem: () => null, setItem: () => {} };
        try {
            this.storage =
                localStorageImpl ??
                (typeof localStorage === "object" && localStorage !== null)
                    ? localStorage
                    : noopStorage;
        } catch (error) {
            this.storage = noopStorage;
        }
    }

    //* Hide constructor and use this instead - return undef if required settings are missing
    public createIfApplicable(
    ) {
    }

    private getSweepReadyObjectUsageClosurePolicy() {
        //* Don't even bother doing this if ThrottlingDurationDays is 0/undefined
        const closures = (() => {
            try {
                //* Encapsulate this in a class that holds the JSON object and can keep it in sync with localStorage
                const rawValue =
                    this.storage.getItem(closuresStorageKey);
                return rawValue === null
                    ? {}
                    : JSON.parse(rawValue) as Record<string, number | undefined>;
            } catch (e) {
                return {};
            }
        })();

        const lastClose = closures[this.uniqueContainerKey];
        const throttlingDurationDays = this.mc.config.getNumber(blackoutPeriodDays);

        // Allow closing if...
        const allowClose = lastClose === undefined // ...We've not closed before, or...
            || throttlingDurationDays === undefined // ...there's no throttling duration set, or...
            || Date.now() > lastClose + throttlingDurationDays * oneDayMs; // ...we've passed the throttling period

        return { allowClose, lastClose, throttlingDurationDays };
    }

    public usageDetectedInMainContainer(errorProps: ITelemetryProperties) {
        if (!sweepReadyUsageDetectionSetting.read(this.mc.config).mainContainer) {
            return;
        }

        const error = new SweepReadyUsageError(
            "SweepReady object used in Non-Summarizer Container",
            { errorDetails: JSON.stringify(errorProps) });

        const { allowClose, lastClose, throttlingDurationDays } =
            this.getSweepReadyObjectUsageClosurePolicy() ?? { allowClose: true };
        if (allowClose) {
            //* Also add props lastClose and throttlingDurationDays?
            this.closeFn(error);
        } else {
            this.mc.logger.sendErrorEvent({
                eventName: "IgnoringSweepReadyObjectUsage",
                details: JSON.stringify({ lastClose, throttlingDurationDays }),
            },
            error);
        }
    }
}

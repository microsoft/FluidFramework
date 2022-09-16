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

/** Feature Gate Key -
 *  How many days between closing the container from this error (avoids locking user out of their file altogether)
 */
export const blackoutPeriodDaysKey = "Fluid.GarbageCollection.Dogfood.SweepReadyUsageDetection.BlackoutPeriodDays";
/** LocalStorage key (NOT via feature gate / monitoring context)
 *  A map from docId to info about the last time we closed due to this error
 */
export const closuresMapLocalStorageKey = "Fluid.GarbageCollection.Dogfood.SweepReadyUsageDetection.Closures";

/**
 * Feature gate key to enable closing the container if SweepReady objects are used.
 * Value should contain keywords "mainContainer" and/or "summarizer" to enable detection in each container type
 */
const sweepReadyUsageDetectionSetting = {
    read(config: IConfigProvider) {
        const sweepReadyUsageDetectionKey = "Fluid.GarbageCollection.Dogfood.SweepReadyUsageDetection";
        const value = config.getString(sweepReadyUsageDetectionKey);
        if (value === undefined) {
            return { mainContainer: false, summarizer: false };
        }
        return {
            mainContainer: value.includes("mainContainer"),
            summarizer: value.includes("summarizer"),
        };
    },
};

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
    public errorType: string = "unreferencedObjectUsedAfterGarbageCollected";
}

/**
 * This class encapsulates the logic around what to do when a SweepReady object is used.
 * There are several tactics we plan to use in Dogfood environments to aid diagnosis of these cases:
 *  - Closing the main container when either the main or summarizer client detects this kind of violation
 *    (via sweepReadyUsageDetectionSetting above)
 *  - Throttling the frequency of these crashes via a "Blackout Period" per container per device
 *   (via blackoutPeriodDaysKey above.  Uses localStorage and closuresMapLocalStorageKey to implement this behavior)
 */
export class SweepReadyUsageDetectionHandler {
    private readonly localStorage: Pick<Storage, "getItem" | "setItem">;

    constructor(
        private readonly uniqueContainerKey: string,
        private readonly mc: MonitoringContext,
        private readonly closeFn: (error?: ICriticalContainerError) => void,
        localStorageOverride?: Pick<Storage, "getItem" | "setItem">,
    ) {
        const noopStorage = { getItem: () => null, setItem: () => {} };
        if (localStorageOverride !== undefined) {
            this.localStorage = localStorageOverride;
        } else {
            try {
                // localStorage is not defined in Node environment so this throws
                this.localStorage = localStorage ?? noopStorage;
            } catch (error) {
                this.localStorage = noopStorage;
            }
        }

        if (this.localStorage === noopStorage) {
            // This means the Blackout Period logic will not work.
            this.mc.logger.sendTelemetryEvent({ eventName: "SweepReadyUsageDetectionHandlerNoOpStorage" });
        }
    }

    /**
      * If SweepReady Usage Detection is enabled, close the main container.
      * If the "Blackout Period" is set, don't close the container more than once in that period.
      *
      * Once Sweep is fully implemented, this will be removed since the objects will be gone
      * and errors will arise elsewhere in the runtime
     */
    public usageDetectedInMainContainer(errorProps: ITelemetryProperties) {
        if (!sweepReadyUsageDetectionSetting.read(this.mc.config).mainContainer) {
            return;
        }

        const pastClosuresMap: Record<string, { lastCloseTime: number; } | undefined> = (() => {
            try {
                const rawValue = this.localStorage.getItem(closuresMapLocalStorageKey);
                const parsedValue = rawValue === null ? {} : JSON.parse(rawValue);
                return typeof parsedValue === "object"
                    ? parsedValue as Record<string, { lastCloseTime: number; } | undefined>
                    : {};
            } catch (e) {
                return {};
            }
        })();

        const lastCloseTime = pastClosuresMap[this.uniqueContainerKey]?.lastCloseTime;
        const blackoutPeriodDays = this.mc.config.getNumber(blackoutPeriodDaysKey);

        const error = new SweepReadyUsageError(
            "SweepReady object used in Non-Summarizer Client",
            { errorDetails: JSON.stringify({ ...errorProps, lastCloseTime, blackoutPeriodDays }) },
        );

        // Should close if...
        const shouldClose = lastCloseTime === undefined // ...We've not closed before, or...
            || blackoutPeriodDays === undefined // ...there's no blackout duration set, or...
            || Date.now() > lastCloseTime + blackoutPeriodDays * oneDayMs; // ...we've passed the blackout period

        if (shouldClose) {
            // Update closures map in localStorage before closing
            // Note there is a race condition between different tabs updating localStorage and overwriting
            // each others' updates. If so, some tab will crash again. Just reload one at a time to get unstuck
            pastClosuresMap[this.uniqueContainerKey] = { lastCloseTime: Date.now() };
            this.localStorage.setItem(closuresMapLocalStorageKey, JSON.stringify(pastClosuresMap));

            this.closeFn(error);
        } else {
            this.mc.logger.sendErrorEvent({ eventName: "IgnoringSweepReadyObjectUsage" }, error);
        }
    }
}

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
 * Feature Gate Key -
 * How many days between closing the container from this error (avoids locking user out of their file altogether)
 */
export const skipClosureForXDaysKey = "Fluid.GarbageCollection.Dogfood.SweepReadyUsageDetection.SkipClosureForXDays";

/**
 * LocalStorage key (NOT via feature gate / monitoring context)
 * A map from docId to info about the last time we closed due to this error
 */
export const closuresMapLocalStorageKey = "Fluid.GarbageCollection.Dogfood.SweepReadyUsageDetection.Closures";

/**
 * Feature gate key to enable closing the container if SweepReady objects are used.
 * Value should contain keywords "interactiveClient" and/or "summarizer" to enable detection in each container type
 */
const sweepReadyUsageDetectionSetting = {
    read(config: IConfigProvider) {
        const sweepReadyUsageDetectionKey = "Fluid.GarbageCollection.Dogfood.SweepReadyUsageDetection";
        const value = config.getString(sweepReadyUsageDetectionKey);
        if (value === undefined) {
            return { interactiveClient: false, summarizer: false };
        }
        return {
            interactiveClient: value.includes("interactiveClient"),
            summarizer: value.includes("summarizer"),
        };
    },
};

/**
 * Error class raised when a SweepReady object is used, indicating a bug in how
 * references are managed in the container by the application, or a bug in how
 * GC tracks those references.
 *
 * There's a chance for false positives when this error is raised by an Interactive Container,
 * since only the Summarizer has the latest truth about unreferenced node tracking
 */
export class SweepReadyUsageError extends LoggingError implements IFluidErrorBase {
    /** This errorType will be in temporary use (until Sweep is fully implemented) so don't add to any errorType type */
    public errorType: string = "unreferencedObjectUsedAfterGarbageCollected";
}

/**
 * This class encapsulates the logic around what to do when a SweepReady object is used.
 * There are several tactics we plan to use in Dogfood environments to aid diagnosis of these cases:
 * - Closing the interactive container when either the interactive or summarizer client detects this kind of violation
 * (via sweepReadyUsageDetectionSetting above)
 * - Throttling the frequency of these crashes via a "Skip Closure Period" per container per device
 * (via skipClosureForXDaysKey above.  Uses localStorage and closuresMapLocalStorageKey to implement this behavior)
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
        // localStorage is not defined in Node environment, so fall back to noopStorage if needed.
        this.localStorage = localStorageOverride ?? globalThis.localStorage ?? noopStorage;

        if (this.localStorage === noopStorage) {
            // This means the Skip Closure Period logic will not work.
            this.mc.logger.sendTelemetryEvent({ eventName: "SweepReadyUsageDetectionHandlerNoopStorage" });
        }
    }

    /**
      * If SweepReady Usage Detection is enabled, close the interactive container.
      * If the SkipClosureForXDays setting is set, don't close the container more than once in that period.
      *
      * Once Sweep is fully implemented, this will be removed since the objects will be gone
      * and errors will arise elsewhere in the runtime
     */
    public usageDetectedInInteractiveClient(errorProps: ITelemetryProperties) {
        if (!sweepReadyUsageDetectionSetting.read(this.mc.config).interactiveClient) {
            return;
        }

        // Default stance is we close every time - this reflects the severity of SweepReady Object Usage.
        // However, we may choose to "throttle" the closures by setting the SkipClosureForXDays setting,
        // which will only allow the container to close once during that period, to avoid locking users out.
        let shouldClose: boolean = true;
        let pastClosuresMap: Record<string, { lastCloseTime: number; } | undefined> = {};
        let lastCloseTime: number | undefined;
        const skipClosureForXDays = this.mc.config.getNumber(skipClosureForXDaysKey);
        if (skipClosureForXDays !== undefined) {
            // Read pastClosuresMap from localStorage then extract the lastCloseTime from the map
            try {
                const rawValue = this.localStorage.getItem(closuresMapLocalStorageKey);
                const parsedValue = rawValue === null ? {} : JSON.parse(rawValue);
                if (typeof parsedValue === "object") {
                    pastClosuresMap = parsedValue;
                }
            } catch (e) {
            }
            lastCloseTime = pastClosuresMap[this.uniqueContainerKey]?.lastCloseTime;

            // Don't close if we did already within the Skip Closure Period
            if (lastCloseTime !== undefined && Date.now() < lastCloseTime + skipClosureForXDays * oneDayMs) {
                shouldClose = false;
            }
        }

        const error = new SweepReadyUsageError(
            "SweepReady object used in Non-Summarizer Client",
            { errorDetails: JSON.stringify({ ...errorProps, lastCloseTime, skipClosureForXDays }) },
        );
        if (shouldClose) {
            // Update closures map in localStorage before closing
            // Note there is a race condition between different tabs updating localStorage and overwriting
            // each others' updates. If so, some tab will crash again. Just reload one at a time to get unstuck
            pastClosuresMap[this.uniqueContainerKey] = { lastCloseTime: Date.now() };
            this.localStorage.setItem(closuresMapLocalStorageKey, JSON.stringify(pastClosuresMap));

            this.closeFn(error);
        } else {
            this.mc.logger.sendErrorEvent({ eventName: "SweepReadyObject_UsageAllowed" }, error);
        }
    }
}

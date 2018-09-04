import { IErrorTrackingService } from "@prague/runtime-definitions";

/**
 * The default service does not track errors.
 */
export class DefaultErrorTracking implements IErrorTrackingService {
    public track<T>(func: () => T): T {
        return func();
    }
}

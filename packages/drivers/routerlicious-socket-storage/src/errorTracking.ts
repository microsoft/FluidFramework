import { IErrorTrackingService } from "@prague/container-definitions";

/**
 * The default error tracking service implementation. It does not track any errors.
 */
export class DefaultErrorTracking implements IErrorTrackingService {
    public track<T>(func: () => T): T {
        return func();
    }
}

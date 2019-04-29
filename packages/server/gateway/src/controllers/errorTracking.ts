import { IErrorTrackingService } from "@prague/container-definitions";
import * as raven from "raven-js";

const sentryDSN = "https://25f5c231660f474fb85fb4daeb070029@sentry.wu2.prague.office-int.com/2";

export class BrowserErrorTrackingService implements IErrorTrackingService {
    private ravenContext: raven.RavenStatic;

    constructor() {
        this.ravenContext = raven.config(sentryDSN).install();
    }

    public track(func: () => void) {
        this.ravenContext.context(func);
    }
}

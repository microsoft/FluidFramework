import { core } from "@prague/client-api";
import * as raven from "raven-js";

const sentryDSN = "https://25f5c231660f474fb85fb4daeb070029@sentry.wu2.prague.office-int.com/2";

export class BrowserErrorTrackingService implements core.IErrorTrackingService {
    private ravenContext: raven.RavenStatic;

    constructor() {
        this.ravenContext = raven.config(sentryDSN).install();
    }

    public track(func: () => void) {
        this.ravenContext.context(func);
    }
}

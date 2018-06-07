// tslint:disable:ban-types
import * as raven from "raven-js";
import { IErrorTrackingService } from "../core-utils";

const sentryDSN = "https://344cbdea481f46baa1d3f5144c90b1f6@sentry.wu2.prague.office-int.com/3";

export class BrowserErrorTrackingService implements IErrorTrackingService {

    private ravenContext: raven.RavenStatic;

    constructor() {
        this.ravenContext = raven.config(sentryDSN).install();
    }

    public track(func: Function) {
        this.ravenContext.context(func);
    }
}

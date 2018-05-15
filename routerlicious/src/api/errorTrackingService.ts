import * as raven from "raven-js";
import { IErrorTrackingService } from "../api-core";

const sentryDSN = "https://7235bc222189462ca65fa1a38591f96b@sentry.wu2.prague.office-int.com/2";

export class ErrorTrackingService implements IErrorTrackingService {

    private ravenContext: raven.RavenStatic;

    constructor() {
        this.ravenContext = raven.config(sentryDSN).install();
    }

    public track(func: Function) {
        this.ravenContext.context(func);
    }
}

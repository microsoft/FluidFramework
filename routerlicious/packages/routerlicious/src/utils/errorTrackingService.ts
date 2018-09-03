import { IErrorTrackingService } from "@prague/runtime-definitions";
import * as raven from "raven";

export class NodeErrorTrackingService implements IErrorTrackingService {

    constructor(private endpoint: string) {
    }

    public track(func: () => void) {
        raven.config(this.endpoint).install();
        raven.context(func);
    }
}

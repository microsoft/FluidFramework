import * as raven from "raven";
import { IErrorTrackingService } from "../core-utils";

export class NodeErrorTrackingService implements IErrorTrackingService {

    constructor(private endpoint: string) {
    }

    public track(func: () => void) {
        raven.config(this.endpoint).install();
        raven.context(func);
    }
}

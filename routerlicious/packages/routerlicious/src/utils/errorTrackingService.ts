import { utils } from "@prague/client-api";
import * as raven from "raven";

export class NodeErrorTrackingService implements utils.IErrorTrackingService {

    constructor(private endpoint: string) {
    }

    public track(func: () => void) {
        raven.config(this.endpoint).install();
        raven.context(func);
    }
}

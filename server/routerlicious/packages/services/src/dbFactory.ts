import { DbFactoryFactory } from "@fluidframework/server-services-core";
import { Provider } from "nconf";
export class RouterlicousDbFactoryFactory extends DbFactoryFactory {
    constructor(config: Provider) {
        const defaultBackend = config.get("db:default") || "MongoDb";
        super(config, [
            { name: "MongoDb", path: "./mongodb", config: config.get("mongo"), factory: "MongoDbFactory" }],
            defaultBackend);
    }
}

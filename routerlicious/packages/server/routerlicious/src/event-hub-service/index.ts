import { EventHubResourcesFactory } from "@prague/lambdas-driver";
import * as path from "path";
import { execute } from "./command";

execute(
    (name: string, lambda: string) => new EventHubResourcesFactory(name, lambda),
    path.join(__dirname, "../../config/config.json"));

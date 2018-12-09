import { KafkaResourcesFactory } from "@prague/lambdas";
import * as path from "path";
import { execute } from "./command";

execute(
    (name: string, lambda: string) => new KafkaResourcesFactory(name, lambda),
    path.join(__dirname, "../../config/config.json"));

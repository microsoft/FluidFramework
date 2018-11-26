import { execute } from "@prague/routerlicious/dist/kafka-service/command";
import * as path from "path";
import { KafkaResourcesFactory } from "./resourcesFactory";

execute(
    (name: string, lambda: string) => new KafkaResourcesFactory(name, lambda),
    path.join(__dirname, "../../config.json"));

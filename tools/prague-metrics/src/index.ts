import { KafkaResourcesFactory } from "@prague/routerlicious/dist/kafka-service/resourcesFactory";
import { KafkaRunnerFactory } from "@prague/routerlicious/dist/kafka-service/runnerFactory";
import * as utils from "@prague/routerlicious/dist/utils";
import * as path from "path";

const name = "prague-metrics";
const lambda = path.join(__dirname, "./plugin.js");

utils.runService(
    new KafkaResourcesFactory(name, lambda),
    new KafkaRunnerFactory(),
    name,
    path.join(__dirname, "../config.json"));

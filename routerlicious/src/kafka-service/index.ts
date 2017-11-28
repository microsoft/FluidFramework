import * as winston from "winston";
import * as utils from "../utils";
import { KafkaResourcesFactory, KafkaRunnerFactory } from "./runnerFactory";

if (process.argv.length !== 3) {
    winston.error("node indes.js <module>");
    process.exit(1);
}

utils.runService(new KafkaResourcesFactory(), new KafkaRunnerFactory(), "kafka-service");

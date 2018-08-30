import * as winston from "winston";
import * as utils from "../utils";
import { KafkaResourcesFactory } from "./resourcesFactory";
import { KafkaRunnerFactory } from "./runnerFactory";

if (process.argv.length !== 4) {
    winston.error("node index.js <name> <lambda>");
    process.exit(1);
}

const name = process.argv[2];
const lambda = process.argv[3];

utils.runService(
    new KafkaResourcesFactory(name, lambda),
    new KafkaRunnerFactory(),
    name);

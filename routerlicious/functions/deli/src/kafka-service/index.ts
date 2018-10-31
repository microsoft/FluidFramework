import { KafkaRunnerFactory } from "@prague/routerlicious/dist/kafka-service/runnerFactory";
import * as utils from "@prague/routerlicious/dist/utils";
import * as commander from "commander";
import * as path from "path";
import { KafkaResourcesFactory } from "./resourcesFactory";

// tslint:disable-next-line:no-var-requires
const packageDetails = require("../package.json");

let action = false;
commander
    .version(packageDetails.version)
    .arguments("<name> <lambda>")
    .action((name: string, lambda: string) => {
        action = true;
        utils.runService(
            new KafkaResourcesFactory(name, lambda),
            new KafkaRunnerFactory(),
            name,
            path.join(__dirname, "../config.json"));
    })
    .parse(process.argv);

if (!action) {
    commander.help();
}

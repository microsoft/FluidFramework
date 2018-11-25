import * as commander from "commander";
import * as path from "path";
import * as utils from "../utils";
import { KafkaResourcesFactory } from "./resourcesFactory";
import { KafkaRunnerFactory } from "./runnerFactory";

// tslint:disable-next-line:no-var-requires
const packageDetails = require("../../package.json");

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
            path.join(__dirname, "../../config.json"));
    })
    .parse(process.argv);

if (!action) {
    commander.help();
}

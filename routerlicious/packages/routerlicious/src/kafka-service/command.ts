import * as commander from "commander";
import * as utils from "../utils";
import { IKafkaResources } from "./resourcesFactory";
import { KafkaRunnerFactory } from "./runnerFactory";

export function execute(
    factoryFn: (name: string, lambda: string) => utils.IResourcesFactory<IKafkaResources>,
    configFile: string) {
    // tslint:disable-next-line:no-var-requires
    const packageDetails = require("../../package.json");

    let action = false;
    commander
        .version(packageDetails.version)
        .arguments("<name> <lambda>")
        .action((name: string, lambda: string) => {
            action = true;
            utils.runService(
                factoryFn(name, lambda),
                new KafkaRunnerFactory(),
                name,
                configFile);
        })
        .parse(process.argv);

    if (!action) {
        commander.help();
    }
}

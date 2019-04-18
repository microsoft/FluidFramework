import * as utils from "@prague/routerlicious/dist/utils";
import * as nconf from "nconf";
import * as path from "path";
import { WalkoutResourcesFactory, WalkoutRunnerFactory } from "./runnerFactory";

const file = path.join(__dirname, "../config.json");
const config = nconf.argv().env("__" as any).file(file).use("memory");
utils.run(
    config,
    new WalkoutResourcesFactory(),
    new WalkoutRunnerFactory());

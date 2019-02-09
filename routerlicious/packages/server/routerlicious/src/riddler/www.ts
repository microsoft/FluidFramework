import * as utils from "@prague/services-utils";
import * as path from "path";
import { RiddlerResourcesFactory, RiddlerRunnerFactory } from "./runnerFactory";

utils.runService(
    new RiddlerResourcesFactory(),
    new RiddlerRunnerFactory(),
    "riddler",
    path.join(__dirname, "../../config/config.json"));

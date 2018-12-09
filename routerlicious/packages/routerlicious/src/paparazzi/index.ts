import * as utils from "@prague/services-utils";
import * as path from "path";
import { PaparazziResourcesFactory, PaparazziRunnerFactory } from "./runnerFactory";

utils.runService(
    new PaparazziResourcesFactory(),
    new PaparazziRunnerFactory(),
    "paparazzi",
    path.join(__dirname, "../../config/config.json"));

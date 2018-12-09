import { runService } from "@prague/services-utils";
import * as path from "path";
import { AlfredResourcesFactory, AlfredRunnerFactory } from "./runnerFactory";

runService(
    new AlfredResourcesFactory(),
    new AlfredRunnerFactory(),
    "alfred",
    path.join(__dirname, "../../config/config.json"));

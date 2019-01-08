import { runService } from "@prague/services-utils";
import * as path from "path";
import { DProcResourcesFactory, DProcRunnerFactory } from "./runnerFactory";

runService(
    new DProcResourcesFactory(),
    new DProcRunnerFactory(),
    "alfred",
    path.join(__dirname, "../config.json"));

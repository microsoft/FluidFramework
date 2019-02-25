import { runService } from "@prague/services-utils";
import * as path from "path";
import { AugLoopResourcesFactory, AugLoopRunnerFactory } from "./runnerFactory";

runService(
    new AugLoopResourcesFactory(),
    new AugLoopRunnerFactory(),
    "headless-agent",
    path.join(__dirname, "../config.json"));

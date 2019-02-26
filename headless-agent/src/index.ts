import { runService } from "@prague/services-utils";
import * as path from "path";
import { HeadlessResourcesFactory, HeadlessRunnerFactory } from "./runnerFactory";

runService(
    new HeadlessResourcesFactory(),
    new HeadlessRunnerFactory(),
    "headless-agent",
    path.join(__dirname, "../config.json"));

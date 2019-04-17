import * as utils from "@prague/services-utils";
import * as path from "path";
import { AdminResourcesFactory, AdminRunnerFactory } from "./runnerFactory";

utils.runService(
  new AdminResourcesFactory(),
  new AdminRunnerFactory(),
  "admin",
  path.join(__dirname, "../config.json"));

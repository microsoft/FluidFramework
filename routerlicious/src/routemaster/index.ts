import * as utils from "../utils";
import { RouteMasterResourcesFactory, RouteMasterRunnerFactory } from "./runnerFactory";

utils.runService(new RouteMasterResourcesFactory(), new RouteMasterRunnerFactory(), "routemaster");

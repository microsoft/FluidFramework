import * as utils from "@prague/services-utils";
import { PaparazziResourcesFactory, PaparazziRunnerFactory } from "./runnerFactory";

utils.runService(new PaparazziResourcesFactory(), new PaparazziRunnerFactory(), "paparazzi");

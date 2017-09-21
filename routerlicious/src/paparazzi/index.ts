import * as utils from "../utils";
import { PaparazziResourcesFactory, PaparazziRunnerFactory } from "./runnerFactory";

utils.runService(new PaparazziResourcesFactory(), new PaparazziRunnerFactory());

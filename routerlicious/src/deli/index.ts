import * as utils from "../utils";
import { DeliResourcesFactory, DeliRunnerFactory } from "./runnerFactory";

utils.runService(new DeliResourcesFactory(), new DeliRunnerFactory());

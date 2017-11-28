import * as utils from "../utils";
import { TmzResourcesFactory, TmzRunnerFactory } from "./runnerFactory";

utils.runService(new TmzResourcesFactory(), new TmzRunnerFactory(), "tmz");

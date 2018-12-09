import * as utils from "@prague/services-utils";
import { RiddlerResourcesFactory, RiddlerRunnerFactory } from "./runnerFactory";

utils.runService(new RiddlerResourcesFactory(), new RiddlerRunnerFactory(), "riddler");

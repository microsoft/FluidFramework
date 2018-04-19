import * as utils from "../utils";
import { RiddlerResourcesFactory, RiddlerRunnerFactory } from "./runnerFactory";

utils.runService(new RiddlerResourcesFactory(), new RiddlerRunnerFactory(), "riddler");

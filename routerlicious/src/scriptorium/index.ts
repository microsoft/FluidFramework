import * as utils from "../utils";
import { ScriptoriumResourcesFactory, ScriptoriumRunnerFactory } from "./runnerFactory";

utils.runService(new ScriptoriumResourcesFactory(), new ScriptoriumRunnerFactory());

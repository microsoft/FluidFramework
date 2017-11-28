import * as utils from "../utils";
import { AlfredResourcesFactory, AlfredRunnerFactory } from "./runnerFactory";

utils.runService(new AlfredResourcesFactory(), new AlfredRunnerFactory(), "alfred");

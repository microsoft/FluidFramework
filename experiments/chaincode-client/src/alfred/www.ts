import * as utils from "@prague/routerlicious/dist/utils";
import { AlfredResourcesFactory, AlfredRunnerFactory } from "./runnerFactory";

// TODO - need to update runService to not do the kafka aspects
utils.runService(new AlfredResourcesFactory(), new AlfredRunnerFactory(), "alfred");

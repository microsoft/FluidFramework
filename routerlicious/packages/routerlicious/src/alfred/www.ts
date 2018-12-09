import { runService } from "@prague/services-utils";
import { AlfredResourcesFactory, AlfredRunnerFactory } from "./runnerFactory";

runService(new AlfredResourcesFactory(), new AlfredRunnerFactory(), "alfred");

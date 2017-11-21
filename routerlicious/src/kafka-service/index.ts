import * as utils from "../utils";
import { KafkaResourcesFactory, KafkaRunnerFactory } from "./runnerFactory";

utils.runService(new KafkaResourcesFactory(), new KafkaRunnerFactory());

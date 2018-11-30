import * as utils from "@prague/routerlicious/dist/utils";
import * as nconf from "nconf";
import * as path from "path";
import * as winston from "winston";
import { RdkafkaProducer } from "../rdkafka";
import { JarvisResourcesFactory, JarvisRunnerFactory } from "./runnerFactory";

/**
 * Variant of run that is used to fully run a service. It configures base settings such as logging. And then will
 * exit the service once the runner completes.
 */
export function runService<T extends utils.IResources>(
    resourceFactory: utils.IResourcesFactory<T>,
    runnerFactory: utils.IRunnerFactory<T>,
    group: string,
    configFile = path.join(__dirname, "../../config.json")) {

    const config = nconf.argv().env("__" as any).file(configFile).use("memory");
    const loggingConfig = config.get("logger");
    utils.configureLogging(loggingConfig);

    winston.configure({
        format: winston.format.simple(),
        transports: [
            new winston.transports.Console({ handleExceptions: true, level: loggingConfig.level}),
        ],
    });

    // Initialize system bus connection
    const kafkaEndpoint = config.get("kafka:endpoint");
    const sendTopic = config.get("system:topics:send");

    const producer = new RdkafkaProducer(kafkaEndpoint, sendTopic);

    const errorTrackingConfig = config.get("error");
    let runningP;
    if (errorTrackingConfig.track) {
        const errorTracker = new utils.NodeErrorTrackingService(errorTrackingConfig.endpoint);
        errorTracker.track(() => {
            runningP = utils.runTracked(config, producer, group, resourceFactory, runnerFactory);
        });
    } else {
        runningP = utils.runTracked(config, producer, group, resourceFactory, runnerFactory);
    }

    // notify of connection
    runningP.then(
        () => {
            winston.info("Exiting");
            process.exit(0);
        },
        (error) => {
            winston.error("Service exiting due to error");
            winston.error(error);
            process.exit(1);
        });
}

runService(new JarvisResourcesFactory(), new JarvisRunnerFactory(), "jarvis");

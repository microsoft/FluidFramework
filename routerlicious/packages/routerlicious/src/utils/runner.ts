import * as bytes from "bytes";
import * as moniker from "moniker";
import * as nconf from "nconf";
import * as os from "os";
import * as path from "path";
import * as winston from "winston";
import * as core from "../core";
import * as utils from "../utils";
import { NodeErrorTrackingService } from "./errorTrackingService";
import { configureLogging } from "./logger";

/**
 * A runner represents a task that starts once start is called. And ends when either start completes
 * or stop is called.
 */
export interface IRunner {
    /**
     * Starts the runner
     */
    start(): Promise<void>;

    /**
     * Stops the runner
     */
    stop(): Promise<void>;
}

/**
 * Base interfaces for resources that can be provided to a runner
 */
export interface IResources {
    /**
     * Disposes fo the resources
     */
    dispose(): Promise<void>;
}

/**
 * A resource factory is used to create the resources needed by a runner
 */
export interface IResourcesFactory<T extends IResources> {
    /**
     * Creates a new set of resources
     */
    create(config: nconf.Provider): Promise<T>;
}

/**
 * A runner factory is used to create new runners
 */
export interface IRunnerFactory<T> {
    /**
     * Creates a new runner
     */
    create(resources: T): Promise<IRunner>;
}

interface IErrorTrackingConfig {
    track: boolean;
    endpoint: string;
}

/**
 * Uses the provided factories to create and execute a runner.
 */
export async function run<T extends IResources>(
    config: nconf.Provider,
    resourceFactory: IResourcesFactory<T>,
    runnerFactory: IRunnerFactory<T>) {

    const resources = await resourceFactory.create(config);
    const runner = await runnerFactory.create(resources);

    // Start the runner and then listen for the message to stop it
    const runningP = runner.start();
    process.on("SIGTERM", () => {
        runner.stop();
    });

    // Wait for the runner to complete
    await runningP;

    // And then dispose of any resources
    await resources.dispose();
}

export async function runTracked<T extends IResources>(
    config: nconf.Provider,
    producer: utils.IProducer,
    group: string,
    resourceFactory: IResourcesFactory<T>,
    runnerFactory: IRunnerFactory<T>): Promise<void> {

    // Notify of the join
    const joinMessage: core.ISystemMessage = {
        group,
        id: os.hostname(),
        operation: core.SystemOperations[core.SystemOperations.Join],
        type: core.SystemType,
    };
    await producer.send(JSON.stringify(joinMessage), null, "__system__").catch((error) => {
        winston.error(error);
    });

    // Run the service. The return result is null if run ran to completion. Or the error itself. We await on it
    // so that we won't send the leave message until the run completes.
    const runError = await run(config, resourceFactory, runnerFactory).then(() => null, (error) => error);

    // Notify of the leave
    const leaveMessage: core.ISystemMessage = {
        group,
        id: os.hostname(),
        operation: core.SystemOperations[core.SystemOperations.Leave],
        type: core.SystemType,
    };
    await producer.send(JSON.stringify(leaveMessage), null, "__system__").catch((error) => {
        winston.error(error);
    });

    return runError ? Promise.reject(runError) : Promise.resolve();
}

/**
 * Variant of run that is used to fully run a service. It configures base settings such as logging. And then will
 * exit the service once the runner completes.
 */
export function runService<T extends IResources>(
    resourceFactory: IResourcesFactory<T>,
    runnerFactory: IRunnerFactory<T>,
    group: string,
    configFile = path.join(__dirname, "../../config/config.json")) {

    const config = nconf.argv().env("__" as any).file(configFile).use("memory");
    configureLogging(config.get("logger"));

    // Initialize system bus connection
    const kafkaConfig = config.get("kafka:lib");
    const maxMessageSize = bytes.parse(config.get("kafka:maxMessageSize"));
    const sendTopic = config.get("system:topics:send");
    const kafkaClientId = moniker.choose();

    const producer = utils.createProducer(
        kafkaConfig.name,
        kafkaConfig.endpoint,
        kafkaClientId,
        sendTopic,
        maxMessageSize);

    const errorTrackingConfig = config.get("error") as IErrorTrackingConfig;
    let runningP;
    if (errorTrackingConfig.track) {
        const errorTracker = new NodeErrorTrackingService(errorTrackingConfig.endpoint);
        errorTracker.track(() => {
            runningP = runTracked(config, producer, group, resourceFactory, runnerFactory);
        });
    } else {
        runningP = runTracked(config, producer, group, resourceFactory, runnerFactory);
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

import * as moniker from "moniker";
import * as nconf from "nconf";
import * as os from "os";
import * as path from "path";
import * as winston from "winston";
import * as core from "../core";
import * as utils from "../utils";
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

async function runTracked<T extends IResources>(
    config: nconf.Provider,
    producer: utils.kafkaProducer.IProducer,
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
    await producer.send(JSON.stringify(joinMessage), "__system__").catch((error) => {
        winston.error(error);
    });

    // Run the service
    const runError = await run(config, resourceFactory, runnerFactory).then(() => null, (error) => error);

    // Notify of the leave
    const leaveMessage: core.ISystemMessage = {
        group,
        id: os.hostname(),
        operation: core.SystemOperations[core.SystemOperations.Leave],
        type: core.SystemType,
    };
    await producer.send(JSON.stringify(leaveMessage), "__system__").catch((error) => {
        winston.error(error);
    });

    return runError ? Promise.resolve() : Promise.reject(runError);
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

    const config = nconf.argv().env(<any> "__").file(configFile).use("memory");
    configureLogging(config.get("logger"));

    // Initialize system bus connection
    const kafkaConfig = config.get("kafka:lib");
    const sendTopic = config.get("system:topics:send");
    const kafkaClientId = moniker.choose();

    const producer = utils.kafkaProducer.create(
        kafkaConfig.name,
        kafkaConfig.endpoint,
        kafkaClientId,
        sendTopic);

    // notify of connection
    const runningP = runTracked(config, producer, group, resourceFactory, runnerFactory);
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

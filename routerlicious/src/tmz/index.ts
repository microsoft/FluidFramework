import { Provider } from "nconf";
import { IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { TmzLambdaFactory } from "./lambdaFactory";
import { TmzResourcesFactory, TmzRunnerFactory } from "./runnerFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const resourceFactory = new TmzResourcesFactory();
    const runnerFactory = new TmzRunnerFactory();

    // Create and start a runner
    const resources = await resourceFactory.create(config);
    const runner = await runnerFactory.create(resources);
    const running = runner.start();

    // Start the lambda factory - linking back to the foreman runner to notify of document updates
    return new TmzLambdaFactory(resources, runner, running);
}

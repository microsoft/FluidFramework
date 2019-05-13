import { ScribeLambdaFactory } from "@prague/lambdas";
import { IPartitionLambdaFactory } from "@prague/services-core";
import { Provider } from "nconf";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    return new ScribeLambdaFactory();
}

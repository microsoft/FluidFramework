import { IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { ServiceGraphLambdaFactory } from "./lambdaFactory";

export function create(): IPartitionLambdaFactory {
    return new ServiceGraphLambdaFactory();
}

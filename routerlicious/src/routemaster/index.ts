import { IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { RouteMasterLambdaFactory } from "./lambdaFactory";

export function create(): IPartitionLambdaFactory {
    return new RouteMasterLambdaFactory();
}

export const id = "routemaster";

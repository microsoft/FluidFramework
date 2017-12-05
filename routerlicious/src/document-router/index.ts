import { IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { DocumentLambdaFactory } from "./lambdaFactory";

export function create(): IPartitionLambdaFactory {
    return new DocumentLambdaFactory();
}

// This probably needs to be a function off of something else - that way the inner lambda
// can return something custom

export const id = "document-router";

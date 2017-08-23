import { Response } from "express";

/**
 * Resolves the Express request response with the provided promise. Or an error if it fails.
 */
export function resolve(promise: Promise<any>, response: Response, successCode = 200, failureCode = 400) {
    promise.then(
        (value) => {
            response.status(successCode).json(value);
        },
        (error) => {
            response.status(failureCode).json(error);
        });
}

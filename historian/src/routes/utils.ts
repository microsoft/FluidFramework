import { Response } from "express";

export function handleResponse<T>(
    resultP: Promise<T>,
    response: Response,
    handler: (value: T) => void,
    status: number = 200) {

    resultP.then(handler).then(
        (result) => response.status(status).json(result),
        (error) => response.status(400).json(error));
}

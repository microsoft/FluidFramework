import * as request from "request";
import { IAuthenticatedUser } from "./messages";

export async function verifyAuthToken(service: string, authToken: any): Promise<IAuthenticatedUser> {
    return new Promise<IAuthenticatedUser>((resolve, reject) => {
        invokeRequest(service, {token: authToken}).then((data: IAuthenticatedUser) => {
            resolve(data);
        }, (err) => {
            reject(err);
        });
    });
}

function invokeRequest(service: string, token: any): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        request.post(
            service,
            {
                body: token,
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json: true,
            },
            (error, result, body) => {
                if (error) {
                    return reject(error);
                }

                if (result.statusCode !== 200) {
                    return reject(result);
                }

                return resolve(body);
            });
    });
}

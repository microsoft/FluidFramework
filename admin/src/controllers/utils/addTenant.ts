import * as request from "request";

export function addTenant(url: string, tenantData: any) {
    const data: any = {
        tenant: tenantData,
    };
    return invokeRequestWithBody(url + "/add", data);
}

export function deleteTenant(url: string, tenantId: string) {
    return invokeRequest(url + "/delete/" + tenantId);
}

function invokeRequestWithBody(service: string, data: any): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        request.post(
            service,
            {
                body: data,
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

function invokeRequest(service: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        request.post(
            service,
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

import * as request from "request";

export function findTenant(url: string, tenantId: string) {
    return new Promise<any>((resolve, reject) => {
        request.get(
            { url: `${url}/${tenantId}`, json: true },
            (error, response, body) => {
                if (error) {
                    reject(error);
                } else if (response.statusCode !== 200) {
                    reject(response.statusCode);
                } else {
                    resolve(body);
                }
            });
    });
}

export function addTenant(url: string, tenantData: any) {
    const data: any = {
        tenant: tenantData,
    };
    return invokePostWithBody(url + "/add", data);
}

export function deleteTenant(url: string, tenantId: string) {
    return invokePost(url + "/delete/" + tenantId);
}

function invokePostWithBody(service: string, data: any): Promise<any> {
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

function invokePost(service: string): Promise<any> {
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

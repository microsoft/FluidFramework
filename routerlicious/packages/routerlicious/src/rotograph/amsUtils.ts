import * as request from "request";

export enum Permission {
    None = 0,
    Read = 1,
    Write = 2,
    Delete = 4,
    List = 8,
}

interface IAssetPolicy {
    DurationInMinutes: string;
    Permissions: Permission;
    Name: string;
}
/**
 * Wrapper around https://docs.microsoft.com/en-us/azure/media-services/previous/media-services-overview
 */
export class AzureMediaServicesManager {
    private clientId: string;
    private clientSecret: string;
    private resource: string;
    private authEndpoint: string;
    private endpoint: string;
    private grantType: string = "client_credentials";
    private token: string;

    constructor(config: any) {
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.authEndpoint = config.authEndpoint;
        this.resource = config.resource;
        this.endpoint = config.endpoint;
    }

    public getToken(): Promise<string> {
        return new Promise((resolve, reject) => {
            request.post(
                this.authEndpoint,
                {
                    form: {
                        client_id: this.clientId,
                        client_secret: this.clientSecret,
                        grant_type: this.grantType,
                        resource: this.resource,
                    },
                    headers: {
                        "content-type": "application/x-www-form-urlencoded",
                        "keep-alive": "true",
                    },
                },
                (error, response, body) => {
                    if (error !== undefined && error !== null) {
                        reject(error);
                    }
                    this.token = JSON.parse(body).access_token;
                    resolve(this.token);
                },
            );
        });
    }

    public createSASLocator(accessPolicyId: string, assetId: string, fileName: string): Promise<string> {
        const body = {
            AccessPolicyId: accessPolicyId,
            AssetId: assetId,
            Type: 1,
        };
        return new Promise((resolve, reject) => {
            request.post(
                this.endpoint + "/Locators",
                {
                    auth: {
                        bearer: this.token,
                    },
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "DataServiceVersion": "3.0",
                        "MaxDataServiceVersion": "3.0",
                        "User-Agent": "rotograph",
                        "x-ms-version": "2.15",
                    },
                    json: body,
                },
                (e, r, b) => {
                    if (e !== undefined && e !== null) {
                        reject(e);
                    }
                    const uploadUri = b.BaseUri + "/" + fileName + b.ContentAccessComponent;

                    resolve(uploadUri);
                },
            );
        });
    }

    public uploadContent(uploadUri: string, buffer: Buffer) {
        return new Promise((resolve, reject) => {
            request.put(
                uploadUri,
                {
                    body: buffer,
                    headers: {
                        "x-ms-blob-type": "BlockBlob",
                    },
                },
                (e, r, b) => {
                    if (e !== undefined && e !== null) {
                        reject(e);
                    }
                    resolve(b);
                },
            );
        });
    }

    public createAssetPolicy(fileName: string, permission: Permission): Promise<string> {
        const body: IAssetPolicy = {
            DurationInMinutes: "100",
            Name: fileName,
            Permissions: Permission.Write,
        };
        return new Promise((resolve, reject) => {
            request.post(
                this.endpoint + "/AccessPolicies",
                {
                    auth: {
                        bearer: this.token,
                    },
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "DataServiceVersion": "3.0",
                        "MaxDataServiceVersion": "3.0",
                        "x-ms-version": "2.15",
                    },
                    json: body,
                },
                (e, r, b) => {
                    if (e !== undefined && e !== null) {
                        reject(e);
                    }
                    resolve(b.Id);
                },
            );
        });
    }

    public createAsset(fileName: string): Promise<string> {
        const bodyVal = {
            Name: fileName,
        };
        return new Promise((resolve, reject) => {
            request.post(
                this.endpoint + "/Assets",
                {
                    auth: {
                        bearer: this.token,
                    },
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "DataServiceVersion": "3.0",
                        "MaxDataServiceVersion": "3.0",
                        "User-Agent": "rotograph",
                        "x-ms-version": "2.15",
                    },
                    json: bodyVal,
                },
                (e, r, b) => {
                    if (e !== undefined && e !== null) {
                        reject(e);
                    }
                    resolve(b.Id);
                },
            );
        });
    }

    public getAssets() {
        return new Promise((resolve, reject) => {
            request.get(
                this.endpoint + "/Assets",
                {
                    auth: {
                        bearer: this.token,
                    },
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "DataServiceVersion": "3.0",
                        "MaxDataServiceVersion": "3.0",
                        "x-ms-version": "2.15",
                    },
                },
                (error, response, b) => {
                    if (error !== undefined && error !== null) {
                        reject(error);
                    }
                    const body = JSON.parse(b);
                    resolve(body);
                },
            );
        });
    }
}

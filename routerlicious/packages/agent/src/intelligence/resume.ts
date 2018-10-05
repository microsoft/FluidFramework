import { Deferred } from "@prague/utils";
import { Client, Message } from "azure-iot-device";
import { Mqtt } from "azure-iot-device-mqtt";
import * as iothub from "azure-iothub";
import { IIntelligentService, IIntelligentServiceFactory } from "./api";

interface IResumeResponse {
    MessageId: string;
    Payload: number;
}

export interface IConfig {
    deviceId: string;
    host: string;
    sharedAccessKey: string;
    sharedAccessKeyName: string;
}

function createClientString(host: string, deviceInfo: iothub.Device): string {
    const deviceId = `DeviceId=${deviceInfo.deviceId}`;
    const sharedAccessKey = `SharedAccessKey=${deviceInfo.authentication.symmetricKey.primaryKey}`;
    return `HostName=${host};${deviceId};${sharedAccessKey}`;
}

/**
 * The resume intelligent service takes in input text and then uses that to classify
 * a document as a resume or not
 */
export class ResumeIntelligentSerivce implements IIntelligentService {
    public name = "Resume";

    private clientP: Promise<Client>;
    private registry: iothub.Registry;
    private deviceId: string;
    private messagePromises: {[key: string]: Deferred<any> } = {};

    constructor(private config: IConfig) {
        this.deviceId = config.deviceId;

        // tslint:disable-next-line:max-line-length
        const connectionString = `HostName=${config.host};SharedAccessKeyName=${config.sharedAccessKeyName};SharedAccessKey=${config.sharedAccessKey}`;
        this.registry = iothub.Registry.fromConnectionString(connectionString);
    }

    public async run(value: any): Promise<any> {
        const client = await this.getClient();
        return this.sendMessage(client, "resumeClassifier", value);
    }

    private async getClient(): Promise<Client> {
        if (!this.clientP) {
            this.clientP = this.createClient(this.config.host, this.config.deviceId);
            this.clientP.catch((error) => {
                // Log the error and then null out the client to cause the next request to try again
                console.error("There was a problem creating the client", error);
                this.clientP = null;
            });
        }

        return this.clientP;
    }

    private async sendMessage(client: Client, method: string, body: string) {
        /* tslint:disable:insecure-random */
        const messageId = Math.floor((Math.random() * 10000) + 1);
        const data = JSON.stringify({
            body: body.substring(0, Math.min(body.length, 200000)),
            deviceId: this.deviceId,
            messageid: messageId,
            method,
        });
        const message = new Message(data);

        const deferred = new Deferred<void>();
        this.messagePromises[messageId] = deferred;

        await new Promise<any>((resolve, reject) => {
            client.sendEvent(message, (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        });

        return deferred.promise;
    }

    private async createClient(host: string, deviceId: string): Promise<Client> {
        const device = await this.createOrGetDeviceIdentity();
        const cs = createClientString(host, device);

        const client = Client.fromConnectionString(cs, Mqtt);
        await new Promise<Client>((resolve, reject) => {
            client.open((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(client);
                }
            });
        });

        client.onDeviceMethod(
            "writeLine",
            (request, response) => {
                const payload = (request.payload as any) as IResumeResponse;

                response.send(200, "Input was written to log.", (err) => {
                    if (err) {
                        console.error("Error writing to log", err);
                    }
                });

                const deferred = this.messagePromises[payload.MessageId];
                deferred.resolve(payload.Payload);
            });

        return client;
    }

    private createOrGetDeviceIdentity(): Promise<iothub.Device> {
        const device = new iothub.Device(null);
        device.deviceId = this.deviceId;

        return new Promise<iothub.Device>((resolve, reject) => {
            this.registry.create(device, (err, deviceInfo, res) => {
                if (err) {
                    this.registry.get(device.deviceId, (registryGetErr, getDeviceInfo) => {
                        if (registryGetErr) {
                            return reject(registryGetErr);
                        }

                        resolve(getDeviceInfo);
                    });
                } else {
                    resolve(deviceInfo);
                }
            });
        });
    }
}

/**
 * Factory to create new resume classifier intelligent services
 */
class ResumeFactory implements IIntelligentServiceFactory {
    public create(config: IConfig): IIntelligentService {
        return new ResumeIntelligentSerivce(config);
    }
}

export const factory: IIntelligentServiceFactory = new ResumeFactory();

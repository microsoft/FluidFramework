import { Client, Message } from "azure-iot-device";
import { Mqtt } from "azure-iot-device-mqtt";
import * as iothub from "azure-iothub";
import * as utils from "../utils";

interface IResumeResponse {
    MessageId: string;
    Payload: number;
}

// tslint:disable-next-line
const connectionString = "HostName=pkarimov-paidIOT.azure-devices.net;SharedAccessKeyName=iothubowner;SharedAccessKey=8mvOmNnUklwnuzY+U96V51w+qCq262ZUpSkdw8nTZ18=";
const registry = iothub.Registry.fromConnectionString(connectionString);

function createClientString(deviceInfo: iothub.Device): string {
    const deviceId = `DeviceId=${deviceInfo.deviceId}`;
    const sharedAccessKey = `SharedAccessKey=${deviceInfo.authentication.symmetricKey.primaryKey}`;
    return `HostName=pkarimov-paidIOT.azure-devices.net;${deviceId};${sharedAccessKey}`;
}

function createOrGetDeviceIdentity(deviceId: string): Promise<iothub.Device> {
    const device = new iothub.Device(null);
    device.deviceId = deviceId;

    return new Promise<iothub.Device>((resolve, reject) => {
        registry.create(device, (err, deviceInfo, res) => {
            if (err) {
                registry.get(device.deviceId, (registryGetErr, getDeviceInfo) => {
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

export interface IIntelligentService {
    name: string;

    /**
     * Runs the intelligent service on the provided input
     */
    run(value: any): Promise<any>;
}

export interface IIntelligentServiceFactory {
    /**
     * Constructs a new intelligent service
     */
    create(): IIntelligentService;
}

/**
 * The resume intelligent service takes in input text and then uses that to classify
 * a document as a resume or not
 */
export class ResumeIntelligentSerivce implements IIntelligentService {
    public name = "resume";

    private clientP: Promise<Client>;
    private messagePromises: {[key: string]: utils.Deferred<any> } = {};

    constructor(private deviceId: string) {
        this.clientP = this.createClient(deviceId);
    }

    public async run(value: any): Promise<any> {
        const client = await this.clientP;
        return this.sendMessage(client, "resumeClassifier", value);
    }

    private async sendMessage(client: Client, method: string, body: string) {
        const messageId = Math.floor((Math.random() * 10000) + 1);
        const data = JSON.stringify({
            body,
            deviceId: this.deviceId,
            messageid: messageId,
            method,
        });
        const message = new Message(data);

        const deferred = new utils.Deferred<void>();
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

    private async createClient(deviceId: string): Promise<Client> {
        const device = await createOrGetDeviceIdentity(deviceId);
        const cs = createClientString(device);

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
                const payload = (<any> request.payload) as IResumeResponse;

                response.send(200, "Input was written to log.", (err) => {
                    if (err) {
                        console.error(err);
                    }
                });

                const deferred = this.messagePromises[payload.MessageId];
                deferred.resolve(payload.Payload);
            });

        return client;
    }
}

/**
 * Factory to create new resume classifier intelligent services
 */
class ResumeFactory implements IIntelligentServiceFactory {
    constructor(private deviceId: string) {
    }

    public create(): IIntelligentService {
        return new ResumeIntelligentSerivce(this.deviceId);
    }
}

export const factory: IIntelligentServiceFactory = new ResumeFactory("myFirstNodeDevice");

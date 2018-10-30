import { IProducer } from "@prague/routerlicious/dist/utils";

export class RdkafkaProducer implements IProducer {
    public send(message: string, key: string): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public close(): Promise<void> {
        throw new Error("Method not implemented.");
    }
}

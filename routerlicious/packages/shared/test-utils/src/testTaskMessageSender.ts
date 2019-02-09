import {
    ITaskMessage,
    ITaskMessageSender,
} from "@prague/services-core";

export class TestTaskMessageSender implements ITaskMessageSender {
    public initialize(): Promise<void> {
        return Promise.resolve();
    }

    public sendTask(queueName: string, message: ITaskMessage): void {
        // Do nothing
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        return this;
    }

    public close(): Promise<void> {
        return Promise.resolve();
    }

}

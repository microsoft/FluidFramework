import { EventEmitter } from "events";
import * as core from "../../core";

export interface IEvent {
    event: string;
    args: any[];
}

export class TestTopic implements core.ITopic {
    public events: IEvent[] = [];

    public emit(event: string, ...args: any[]) {
        this.events.push({
            args,
            event,
        });
    }
}

export class TestPublisher implements core.IPublisher {
    private events = new EventEmitter();
    private topics: { [topic: string]: TestTopic } = {};

    public on(event: string, listener: (...args: any[]) => void) {
        this.events.on(event, listener);
    }

    public to(topic: string): TestTopic {
        if (!(topic in this.topics)) {
            this.topics[topic] = new TestTopic();
        }

        return this.topics[topic];
    }
}

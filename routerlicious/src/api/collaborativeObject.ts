import { EventEmitter } from "events";

export class CollaborativeObject {
    // tslint:disable-next-line:variable-name
    public __collaborativeObject__ = true;

    protected events = new EventEmitter();

    public on(event: string, listener: Function): this {
        this.events.on(event, listener);
        return this;
    }

    public removeListener(event: string, listener: Function): this {
        this.events.removeListener(event, listener);
        return this;
    }

    public removeAllListeners(event?: string): this {
        this.events.removeAllListeners(event);
        return this;
    }
}

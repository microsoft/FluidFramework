export interface IEvent{
    (event: string, listener: (...args: any[]) => void);
}

export interface IEmitter<TEvent extends IEvent> {
    on: TEvent;
    off: TEvent;
    once: TEvent;
}

export interface IErrorEvent extends IEvent {
    (event: "error", listener: (message: any) => void);
}

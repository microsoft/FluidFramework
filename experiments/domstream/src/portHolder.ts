import { debugPort } from "./debug";

export class PortHolder {
    private port: chrome.runtime.Port;
    constructor(port: chrome.runtime.Port) {
        this.port = port;
    }
    protected getPort() {
        return this.port;
    }
    protected postMessage(message: any[]) {
        debugPort("Sending message: ", ...message);
        this.port.postMessage(message);
    }
    protected addMessageListener(listener: (message: any[]) => void) {
        this.port.onMessage.addListener(listener);
    }
    protected removeMessageListener(listener: (message: any[]) => void) {
        this.port.onMessage.removeListener(listener);
    }
}

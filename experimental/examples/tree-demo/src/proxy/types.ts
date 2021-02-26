import { TreeArrayProxy } from "./sharedtree";

export interface IBubble {
    x: number;
    y: number;
    r: number;
    vx: number;
    vy: number;
}

export interface IClient {
    clientId: string;
    color: string;
    bubbles: TreeArrayProxy<IBubble>;
}

export interface IApp {
    clients: TreeArrayProxy<IClient>;
}

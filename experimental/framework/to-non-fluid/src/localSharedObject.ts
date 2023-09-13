import { ILocalChannel } from "./interfaces";

export class LocalSharedObject implements ILocalChannel {
	constructor(public readonly id: string, public readonly type: string) {}
}

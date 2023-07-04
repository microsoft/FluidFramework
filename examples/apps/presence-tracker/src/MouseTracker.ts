/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { EventEmitter } from "events";
import { ISignaler, SignalListener } from "@fluid-experimental/data-objects";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { assert } from "@fluidframework/common-utils";
import { InternalSignaler } from "./InternalSignaler";

export interface IMouseTracker extends EventEmitter, ISignaler {
	getMousePresences(): Map<string, IMousePosition>;
	on(event: "mousePositionChanged", listener: () => void);
}

export interface IMousePosition {
	x: number;
	y: number;
}

export interface IMouseSignalPayload {
	userId: string;
	pos: IMousePosition;
}

export class MouseTracker extends DataObject implements IMouseTracker {
	private static readonly mouseSignalType = "positionChanged";

	/**
	 * Local map of mouse position status for clients
	 *
	 * ```
	 * Map<userId, Map<clientid, position>>
	 * ```
	 */
	private readonly posMap = new Map<string, Map<string, IMousePosition>>();

	private readonly onMouseSignalFn = (clientId: string, payload: IMouseSignalPayload) => {
		const userId: string = payload.userId;
		const position: IMousePosition = payload.pos;

		let clientIdMap = this.posMap.get(userId);
		if (clientIdMap === undefined) {
			clientIdMap = new Map<string, IMousePosition>();
			this.posMap.set(userId, clientIdMap);
		}
		clientIdMap.set(clientId, position);
		this.emit("mousePositionChanged");
	};

	private _signaler: InternalSignaler | undefined;
	private get signaler(): InternalSignaler {
		assert(this._signaler !== undefined, "internal signaler should be defined");
		return this._signaler;
	}

	public static get Name() {
		return "mouseTracker";
	}

	protected async hasInitialized() {
		this._signaler = new InternalSignaler(this.runtime);

		const audience = this.runtime.getAudience();

		audience.on("removeMember", (clientId: string, member: any) => {
			const focusClientIdMap = this.posMap.get(member.userId);
			if (focusClientIdMap !== undefined) {
				focusClientIdMap.delete(clientId);
				if (focusClientIdMap.size === 0) {
					this.posMap.delete(member.userId);
				}
			}
			this.emit("focusChanged");
		});

		this.signaler.on("error", (error) => {
			this.emit("error", error);
		});
		this.signaler.onSignal(
			MouseTracker.mouseSignalType,
			(clientId: string, local: boolean, payload: IMouseSignalPayload) => {
				this.onMouseSignalFn(clientId, payload);
			},
		);
		window.addEventListener("mousemove", (e) => {
			const position: IMousePosition = {
				x: e.clientX,
				y: e.clientY,
			};
			this.sendMouseSignal(position);
		});
	}

	// ISignaler methods  Note these are all passthroughs

	public onSignal(signalName: string, listener: SignalListener): ISignaler {
		this.signaler.onSignal(signalName, listener);
		return this;
	}

	public offSignal(signalName: string, listener: SignalListener): ISignaler {
		this.signaler.offSignal(signalName, listener);
		return this;
	}

	public submitSignal(signalName: string, payload?: any) {
		this.signaler.submitSignal(signalName, payload);
	}

	/**
	 * Alert all connected clients that there has been a change to a client's mouse position
	 */
	private sendMouseSignal(position: IMousePosition) {
		this.signaler.submitSignal(MouseTracker.mouseSignalType, {
			userId: this.runtime.clientId as any,
			pos: position,
		});
	}

	public getMousePresences(): Map<string, IMousePosition> {
		const statuses: Map<string, IMousePosition> = new Map<string, IMousePosition>();
		const audience = this.runtime.getAudience();

		for (const [key, values] of audience.getMembers()) {
			const focus = this.getMousePresenceForUser(this.runtime.clientId as any, key);
			if (focus !== undefined) {
				// eslint-disable-next-line @typescript-eslint/dot-notation
				statuses.set(values.user["name"], focus);
			}
		}
		return statuses;
	}

	public getMousePresenceForUser(userId: string, clientId: string): IMousePosition | undefined {
		return this.posMap.get(userId)?.get(clientId);
	}
}

export const MouseTrackerInstantiationFactory = new DataObjectFactory(
	"mouseTracker",
	MouseTracker,
	[],
	{},
);

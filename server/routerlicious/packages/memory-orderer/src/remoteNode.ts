/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { EventEmitter } from "events";
import { IClient, IDocumentMessage } from "@fluidframework/protocol-definitions";
import {
	Deferred,
	INode,
	IOrderer,
	IOrdererConnection,
	IServiceConfiguration,
	IWebSocket,
	MongoManager,
} from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { debug } from "./debug";
import {
	IConcreteNode,
	IConnectedMessage,
	IConnectMessage,
	INodeMessage,
	IOpMessage,
} from "./interfaces";
import { IOrdererConnectionFactory, ProxyOrderer } from "./proxyOrderer";
import { Socket } from "./socket";

class ProxySocketConnection implements IOrdererConnection {
	public get clientId(): string {
		return this.details.clientId;
	}

	public get existing(): boolean {
		return this.details.existing;
	}

	public get maxMessageSize(): number {
		return this.details.maxMessageSize;
	}

	public get serviceConfiguration(): IServiceConfiguration {
		return this.details.serviceConfiguration;
	}

	constructor(
		public readonly tenantId: string,
		public readonly documentId: string,
		private readonly socket: IWebSocket,
		private readonly node: RemoteNode,
		private readonly cid: number,
		private readonly details: IConnectedMessage,
	) {}

	public async connect() {
		return;
	}

	public async order(messages: IDocumentMessage[]) {
		this.node.send(this.cid, "order", messages);
	}

	public async disconnect() {
		this.node.send(this.cid, "disconnect", null);
	}

	public emit(op: string, id: string, ...data: any[]) {
		this.socket.emit(op, id, ...data);
	}

	public once(event: "error", listener: (...args: any[]) => void) {
		return;
	}

	public off(event: "error", listener: (...args: any[]) => void) {
		return;
	}
}

class ProxySocketThing implements IOrdererConnectionFactory {
	constructor(
		private readonly node: RemoteNode,
		private readonly tenantId: string,
		private readonly documentId: string,
	) {
		// Return;
	}

	public async connect(socket: IWebSocket, client: IClient): Promise<IOrdererConnection> {
		return this.node.connect(socket, this.tenantId, this.documentId, client);
	}
}

interface IPendingConnection {
	deferred: Deferred<IOrdererConnection>;
	socket: IWebSocket;
	tenantId: string;
	documentId: string;
}

/**
 * Connection to a remote node
 */
export class RemoteNode extends EventEmitter implements IConcreteNode {
	public static async connect(
		id: string,
		mongoManager: MongoManager,
		nodeCollectionName: string,
	): Promise<RemoteNode> {
		// Connect to the given remote node
		const db = await mongoManager.getDatabase();
		const nodeCollection = db.collection<INode>(nodeCollectionName);
		const details = (await nodeCollection.findOne({ _id: id })) ?? undefined;

		const socket =
			details !== undefined && details.expiration >= Date.now()
				? await Socket.connect<INodeMessage>(details.address, id)
				: undefined;
		const node = new RemoteNode(id, socket);

		return node;
	}

	public get id(): string {
		return this._id;
	}

	public get valid(): boolean {
		return this.socket !== null;
	}

	private readonly connectMap = new Map<number, IPendingConnection>();
	private readonly orderers = new Map<string, ProxyOrderer>();
	private readonly topicMap = new Map<string, ProxySocketConnection[]>();
	private cid = 0;

	// TODO establish some kind of connection to the node from here?
	// should I rely on the remote node to update me of its details? And only fall back to mongo if necessary?
	// I can probably assume it's all good so long as it tells me things are good. And then I avoid the update loop.
	// Expired nodes I can track separately.

	private constructor(
		private readonly _id: string,
		private readonly socket: Socket<INodeMessage> | undefined,
	) {
		super();

		this.socket?.on("message", (message) => {
			switch (message.type) {
				case "op":
					this.route(message.payload as IOpMessage);
					break;

				case "connected":
					// eslint-disable-next-line no-case-declarations
					const pendingConnect = this.connectMap.get(message.cid);
					assert(pendingConnect);
					this.connectMap.delete(message.cid);

					// eslint-disable-next-line no-case-declarations
					const socketConnection = new ProxySocketConnection(
						pendingConnect.tenantId,
						pendingConnect.documentId,
						pendingConnect.socket,
						this,
						message.cid,
						message.payload as IConnectedMessage,
					);

					// Add new connection to routing tables
					this.topicMap.set(`client#${socketConnection.clientId}`, [socketConnection]);
					// eslint-disable-next-line no-case-declarations
					const fullId = `${pendingConnect.tenantId}/${pendingConnect.documentId}`;
					if (!this.topicMap.has(fullId)) {
						this.topicMap.set(fullId, []);
					}
					this.topicMap.get(fullId)?.push(socketConnection);

					pendingConnect.deferred.resolve(socketConnection);
					break;
				default:
					break;
			}
		});
	}

	public async connectOrderer(tenantId: string, documentId: string): Promise<IOrderer> {
		const fullId = `${tenantId}/${documentId}`;
		assert(!this.orderers.has(fullId));
		debug(`Connecting to ${fullId}:${this.id}`);
		Lumberjack.debug(`Connecting to ${fullId}:${this.id}`);
		const orderer = new ProxyOrderer(new ProxySocketThing(this, tenantId, documentId));
		this.orderers.set(fullId, orderer);

		return orderer;
	}

	public send(cid: number, type: string, payload: any) {
		this.socket?.send({
			cid,
			payload,
			type: type as any,
		});
	}

	public async connect(
		socket: IWebSocket,
		tenantId: string,
		documentId: string,
		client: IClient,
	): Promise<IOrdererConnection> {
		const cid = this.getNextCid();
		const connectMessage: IConnectMessage = {
			client,
			documentId,
			tenantId,
		};

		const deferred = new Deferred<IOrdererConnection>();
		this.connectMap.set(cid, { socket, deferred, tenantId, documentId });
		this.send(cid, "connect", connectMessage);

		return deferred.promise;
	}

	private route(message: IOpMessage) {
		const sockets = this.topicMap.get(message.topic);
		for (const socket of sockets ?? []) {
			socket.emit(message.op, message.data[0], ...message.data.slice(1));
		}
	}

	private getNextCid() {
		return this.cid++;
	}
}

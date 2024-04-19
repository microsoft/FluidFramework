/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Deferred } from "@fluidframework/common-utils";
import {
	IClientJoin,
	IConnect,
	IConnected,
	ISequencedDocumentSystemMessage,
	type ISignalMessage,
	MessageType,
	ScopeType,
	INack,
	INackContent,
	NackErrorType,
	IClient,
	IDocumentMessage,
	type ISentSignalMessage,
} from "@fluidframework/protocol-definitions";
import { KafkaOrdererFactory } from "@fluidframework/server-kafka-orderer";
import { LocalWebSocket, LocalWebSocketServer } from "@fluidframework/server-local-server";
import { configureWebSocketServices } from "@fluidframework/server-lambdas";
import { PubSub } from "@fluidframework/server-memory-orderer";
import * as services from "@fluidframework/server-services";
import { generateToken } from "@fluidframework/server-services-utils";
import {
	clientConnectivityStorageId,
	DefaultMetricClient,
	DefaultServiceConfiguration,
	IClientManager,
	IOrdererManager,
	MongoDatabaseManager,
	MongoManager,
	RawOperationType,
	signalUsageStorageId,
} from "@fluidframework/server-services-core";
import { TestEngine1, Lumberjack } from "@fluidframework/server-services-telemetry";
import {
	MessageFactory,
	TestClientManager,
	TestDbFactory,
	TestKafka,
	TestTenantManager,
	DebugLogger,
	TestThrottler,
	TestThrottleAndUsageStorageManager,
	TestNotImplementedDocumentRepository,
} from "@fluidframework/server-test-utils";
import { OrdererManager } from "../../nexus";
import { Throttler, ThrottlerHelper } from "@fluidframework/server-services";
import Sinon from "sinon";

const lumberjackEngine = new TestEngine1();
if (!Lumberjack.isSetupCompleted()) {
	Lumberjack.setup([lumberjackEngine]);
}

describe("Routerlicious", () => {
	describe("Nexus", () => {
		describe("WebSockets", () => {
			describe("Messages", () => {
				const testTenantId = "test";
				const testSecret = "test";
				const testId = "test";
				const url = "http://test";

				let webSocketServer: LocalWebSocketServer;
				let deliKafka: TestKafka;
				let testOrderer: IOrdererManager;
				let testTenantManager: TestTenantManager;
				let testClientManager: IClientManager;

				const throttleLimitTenant = 7;
				const throttleLimitConnectDoc = 4;

				beforeEach(async () => {
					const collectionNames = "test";
					const testData: { [key: string]: any[] } = {};

					deliKafka = new TestKafka();
					const producer = deliKafka.createProducer();
					testTenantManager = new TestTenantManager(url);
					testClientManager = new TestClientManager();
					const testDbFactory = new TestDbFactory(testData);
					const mongoManager = new MongoManager(testDbFactory);
					const testDocumentRepository = new TestNotImplementedDocumentRepository();
					const globalDbEnabled = false;

					const databaseManager = new MongoDatabaseManager(
						globalDbEnabled,
						mongoManager,
						mongoManager,
						collectionNames,
						collectionNames,
						collectionNames,
						collectionNames,
						collectionNames,
					);
					const testStorage = new services.DocumentStorage(
						testDocumentRepository,
						testTenantManager,
						false,
						await databaseManager.getDeltaCollection(undefined, undefined),
						undefined,
					);
					const kafkaOrderer = new KafkaOrdererFactory(
						producer,
						1024 * 1024,
						DefaultServiceConfiguration,
					);
					testOrderer = new OrdererManager(
						false,
						url,
						testTenantManager,
						null,
						kafkaOrderer,
					);

					const pubsub = new PubSub();
					webSocketServer = new LocalWebSocketServer(pubsub);

					const testConnectionThrottlerPerTenant = new TestThrottler(throttleLimitTenant);
					const testConnectionThrottlerPerCluster = new TestThrottler(
						throttleLimitConnectDoc,
					);
					const testSubmitOpThrottler = new TestThrottler(throttleLimitTenant);

					configureWebSocketServices(
						webSocketServer,
						testOrderer,
						testTenantManager,
						testStorage,
						testClientManager,
						new DefaultMetricClient(),
						DebugLogger.create("fluid-server:TestNexusIO"),
						undefined,
						undefined,
						100,
						false,
						false,
						false,
						undefined,
						testConnectionThrottlerPerTenant,
						testConnectionThrottlerPerCluster,
						testSubmitOpThrottler,
						undefined,
						undefined,
					);
				});

				function connectToServer(
					id: string,
					tenantId: string,
					secret: string,
					socket: LocalWebSocket,
					v2Signals: boolean = false,
				): Promise<IConnected> {
					const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
					const token = generateToken(tenantId, id, secret, scopes);

					const connectMessage: IConnect = {
						client: undefined,
						id,
						mode: "write",
						tenantId,
						token,
						versions: ["^0.3.0", "^0.2.0", "^0.1.0"],
					};

					connectMessage.supportedFeatures = v2Signals ? { submit_signals_v2: true } : {};

					const deferred = new Deferred<IConnected>();

					socket.on("connect_document_success", (connectedMessage: IConnected) => {
						deferred.resolve(connectedMessage);
					});

					socket.on("connect_document_error", (error: any) => {
						deferred.reject(error);
					});

					socket.on("nack", (reason: string, nackMessages: INack[]) => {
						deferred.reject(nackMessages);
					});

					socket.send(
						"connect_document",
						connectMessage,
						(error: any, connectedMessage: IConnected) => {
							if (error) {
								deferred.reject(error);
							} else {
								deferred.resolve(connectedMessage);
							}
						},
					);

					return deferred.promise;
				}

				describe("#connect_document", () => {
					it("Should connect to and create a new interactive document on first connection", async () => {
						const socket = webSocketServer.createConnection();
						const connectMessage = await connectToServer(
							testId,
							testTenantId,
							testSecret,
							socket,
						);
						assert.ok(connectMessage.clientId);
						assert.equal(connectMessage.existing, true);

						// Verify a connection message was sent
						const message = deliKafka.getLastMessage();
						const systemJoinMessage =
							message.operation as ISequencedDocumentSystemMessage;
						assert.equal(message.documentId, testId);
						assert.equal(systemJoinMessage.clientId, undefined);
						assert.equal(systemJoinMessage.type, MessageType.ClientJoin);
						const JoinMessage = JSON.parse(systemJoinMessage.data) as IClientJoin;
						assert.equal(JoinMessage.clientId, connectMessage.clientId);
					});

					it("Should support multiple connections to an existing document", async () => {
						const firstSocket = webSocketServer.createConnection();
						const firstConnectMessage = await connectToServer(
							testId,
							testTenantId,
							testSecret,
							firstSocket,
						);
						assert.equal(firstConnectMessage.existing, true);

						const secondSocket = webSocketServer.createConnection();
						const secondConnectMessage = await connectToServer(
							testId,
							testTenantId,
							testSecret,
							secondSocket,
						);
						assert.equal(secondConnectMessage.existing, true);
					});

					it("Should throttle excess connections for the cluster", async () => {
						for (let i = 0; i < throttleLimitConnectDoc; i++) {
							const id = `${testId}-${i}`;
							const socket = webSocketServer.createConnection();
							const connectMessage = await connectToServer(
								id,
								testTenantId,
								testSecret,
								socket,
							);
							assert.ok(connectMessage.clientId);
							assert.equal(connectMessage.existing, true);

							// Verify a connection message was sent
							const message = deliKafka.getLastMessage();
							const systemJoinMessage =
								message.operation as ISequencedDocumentSystemMessage;
							assert.equal(message.documentId, id);
							assert.equal(systemJoinMessage.clientId, undefined);
							assert.equal(systemJoinMessage.type, MessageType.ClientJoin);
							const JoinMessage = JSON.parse(systemJoinMessage.data) as IClientJoin;
							assert.equal(JoinMessage.clientId, connectMessage.clientId);
						}

						const failedConnectMessage = (await connectToServer(
							`${testId}-${throttleLimitConnectDoc + 1}`,
							testTenantId,
							testSecret,
							webSocketServer.createConnection(),
						)
							.then(() => {
								assert.fail("Connection should have failed");
							})
							.catch((err) => {
								return err;
							})) as INackContent;
						assert.strictEqual(failedConnectMessage.code, 429);
						assert.strictEqual(
							failedConnectMessage.type,
							NackErrorType.ThrottlingError,
						);
						assert.strictEqual(failedConnectMessage.retryAfter, 1);

						// A separate tenant should also be throttled, since throttleLimitConnectDoc is reached
						const failedConnectMessage2 = (await connectToServer(
							`${testId}-${throttleLimitConnectDoc + 2}`,
							`${testTenantId}-2`,
							testSecret,
							webSocketServer.createConnection(),
						)
							.then(() => {
								assert.fail("Connection should have failed");
							})
							.catch((err) => {
								return err;
							})) as INackContent;
						assert.strictEqual(failedConnectMessage2.code, 429);
						assert.strictEqual(
							failedConnectMessage2.type,
							NackErrorType.ThrottlingError,
						);
						assert.strictEqual(failedConnectMessage2.retryAfter, 1);
					});
				});

				describe("#disconnect", () => {
					it("Should disconnect from an interactive document", async () => {
						const socket = webSocketServer.createConnection();
						const connectMessage = await connectToServer(
							testId,
							testTenantId,
							testSecret,
							socket,
						);
						socket.send("disconnect");

						// Connect a second client just to have something to await on.
						// There is no ack for the disconnect, but the message will be ordered with future messages.
						await connectToServer(
							testId,
							testTenantId,
							testSecret,
							webSocketServer.createConnection(),
						);

						assert.equal(deliKafka.getRawMessages().length, 3);
						const message = deliKafka.getMessage(1);
						assert.equal(message.documentId, testId);
						const systemLeaveMessage =
							message.operation as ISequencedDocumentSystemMessage;
						assert.equal(systemLeaveMessage.clientId, undefined);
						assert.equal(systemLeaveMessage.type, MessageType.ClientLeave);
						const clientId = JSON.parse(systemLeaveMessage.data) as string;
						assert.equal(clientId, connectMessage.clientId);
					});
				});

				describe("#submitSignal", () => {
					interface Client {
						socket: LocalWebSocket;
						clientId: string;
						signalPromise: Promise<ISignalMessage>;
						signalCount: number;
					}

					const createSignalPromise = (client: Client): Promise<ISignalMessage> => {
						return new Promise<ISignalMessage>((resolve) => {
							client.socket.on("signal", (signal: ISignalMessage) => {
								client.signalCount++;
								resolve(signal);
							});
						});
					};

					const createSignalNotReceivedPromise = (client: Client): Promise<void> => {
						return new Promise<void>((resolve) => {
							client.socket.on("signal", (signal: ISignalMessage) => {
								assert.fail("Signal should not have been received");
							});
							setTimeout(resolve, 100);
						});
					};

					const createClient = async (
						testId: string,
						testTenantId: string,
						testSecret: string,
						v2: boolean = false,
					): Promise<Client> => {
						const socket = webSocketServer.createConnection();
						const connectMessage = await connectToServer(
							testId,
							testTenantId,
							testSecret,
							socket,
							v2,
						);
						const clientId = connectMessage.clientId;
						const client: Client = {
							socket,
							clientId,
							signalPromise: null,
							signalCount: 0,
						};

						return client;
					};

					const stringSignalContent = "TestSignal";

					let clients: Client[];

					const numberOfClients = 3; // Change the amount of clients to test with (at leat 2 required)

					assert(numberOfClients > 1, "Test requires at least 2 clients");

					describe("v1 signals", () => {
						beforeEach(async () => {
							clients = [];

							for (let i = 0; i < numberOfClients; i++) {
								const client = await createClient(testId, testTenantId, testSecret);
								clients.push(client);
							}

							clients.forEach((client) => {
								client.signalPromise = createSignalPromise(client);
							});
						});
						it("Single Signal", async () => {
							clients[0].socket.send("submitSignal", clients[0].clientId, [
								stringSignalContent,
							]);

							const userSignals = await Promise.all(
								clients.map((client) => client.signalPromise),
							);

							clients.forEach((client, index) => {
								assert.equal(
									client.signalCount,
									1,
									`User ${index + 1} should have received 1 signal`,
								);
								assert.equal(
									userSignals[index].content,
									stringSignalContent,
									`User ${index + 1} signal content mismatch`,
								);
							});
						});

						it("Multiple Signals", async () => {
							clients[0].socket.send("submitSignal", clients[0].clientId, [
								stringSignalContent,
							]);

							let userSignals = await Promise.all(
								clients.map((client) => client.signalPromise),
							);

							clients.forEach((client, index) => {
								assert.equal(
									client.signalCount,
									1,
									`User ${index + 1} should have received 1 signal`,
								);
								assert.equal(
									userSignals[index].content,
									stringSignalContent,
									`User ${index + 1} signal content mismatch`,
								);
							});

							clients[1].socket.send("submitSignal", clients[1].clientId, [
								stringSignalContent,
							]);

							userSignals = await Promise.all(
								clients.map((client) => client.signalPromise),
							);

							clients.forEach((client, index) => {
								assert.equal(
									client.signalCount,
									2,
									`User ${index + 1} should have received 2 signals`,
								);
								assert.equal(
									userSignals[index].content,
									stringSignalContent,
									`User ${index + 1} signal content mismatch`,
								);
							});
						});

						it("Invalid clientID", async () => {
							const noSignalReceivedPromises = clients.map((client) => {
								return createSignalNotReceivedPromise(client);
							});
							clients[0].socket.send("submitSignal", "invalidClientID", [
								stringSignalContent,
							]);
							await Promise.all(noSignalReceivedPromises);
						});

						it("Receiving client disconnect", async () => {
							clients[1].socket.disconnect();

							clients[0].socket.send("submitSignal", clients[0].clientId, [
								stringSignalContent,
							]);

							await Promise.all(
								clients.map((client, index) => {
									if (index !== 1) {
										return client.signalPromise;
									}
									return createSignalNotReceivedPromise(client);
								}),
							);

							clients.forEach((client, index) => {
								if (index !== 1) {
									// Connected clients recieve 1 disconnect signal + 1 submitSignal
									assert.equal(
										client.signalCount,
										2,
										`User ${index + 1} should have received 2 signals`,
									);
								} else {
									assert.equal(
										client.signalCount,
										0,
										`User ${index + 1} should have received 0 signals`,
									);
								}
							});
						});

						it("Client send then disconnect", async () => {
							clients[0].socket.send("submitSignal", clients[0].clientId, [
								stringSignalContent,
							]);
							clients[0].socket.disconnect();

							clients.forEach((client, index) => {
								if (index !== 0) {
									// Connected clients recieve 1 broadcast signal + 1 disconnect signal
									assert.equal(
										client.signalCount,
										2,
										`User ${index + 1} should have received 2 signals`,
									);
								} else {
									// Disconnected client recieves 1 broadcast signal
									assert.equal(
										client.signalCount,
										1,
										`User ${index + 1} should have received 1 signal`,
									);
								}
							});
						});

						describe("content type variations", () => {
							it("Number content", async () => {
								const numberSignalContent = 42;
								clients[0].socket.send("submitSignal", clients[0].clientId, [
									numberSignalContent,
								]);
								const userSignals = await Promise.all(
									clients.map((client) => client.signalPromise),
								);

								clients.forEach((client, index) => {
									assert.equal(
										client.signalCount,
										1,
										`User ${index + 1} should have received 1 signal`,
									);
									assert.equal(
										userSignals[index].content,
										numberSignalContent,
										`User ${index + 1} signal content mismatch`,
									);
								});
							});
							it("Boolean content", async () => {
								const booleanSignalContent = true;
								clients[0].socket.send("submitSignal", clients[0].clientId, [
									booleanSignalContent,
								]);
								const userSignals = await Promise.all(
									clients.map((client) => client.signalPromise),
								);

								clients.forEach((client, index) => {
									assert.equal(
										client.signalCount,
										1,
										`User ${index + 1} should have received 1 signal`,
									);
									assert.equal(
										userSignals[index].content,
										booleanSignalContent,
										`User ${index + 1} signal content mismatch`,
									);
								});
							});
							it("JSON/Object content", async () => {
								const objectSignalContent = {
									key1: "value1",
									key2: 42,
									key3: true,
								};
								clients[0].socket.send("submitSignal", clients[0].clientId, [
									objectSignalContent,
								]);
								const userSignals = await Promise.all(
									clients.map((client) => client.signalPromise),
								);

								clients.forEach((client, index) => {
									assert.equal(
										client.signalCount,
										1,
										`User ${index + 1} should have received 1 signal`,
									);
									assert.deepEqual(
										userSignals[index].content,
										objectSignalContent,
										`User ${index + 1} signal content mismatch`,
									);
								});
							});
							it("Class content", async () => {
								class Person {
									name: string;
									age: number;
									address?: {
										street: string;
										city: string;
										country: string;
									};

									constructor(
										name: string,
										age: number,
										address?: { street: string; city: string; country: string },
									) {
										this.name = name;
										this.age = age;
										this.address = address;
									}
								}
								const person = new Person("Willie", 22);

								clients[0].socket.send("submitSignal", clients[0].clientId, [
									person,
								]);

								await Promise.all(
									clients.map((client) => createSignalNotReceivedPromise(client)),
								);
							});
						});
					});

					describe("v2 signals", () => {
						beforeEach(async () => {
							clients = [];

							for (let i = 0; i < numberOfClients; i++) {
								const client = await createClient(
									testId,
									testTenantId,
									testSecret,
									true,
								);
								clients.push(client);
							}

							clients.forEach((client) => {
								client.signalPromise = createSignalPromise(client);
							});
						});
						it("Verify targeted signal", async () => {
							const targetedSignal: ISentSignalMessage = {
								targetClientId: clients[0].clientId,
								content: "TargetSignal",
								clientConnectionNumber: 1,
								referenceSequenceNumber: 1,
							};

							clients[1].socket.send("submitSignal", clients[1].clientId, [
								targetedSignal,
							]);

							const user1Signal = await clients[0].signalPromise;

							clients.forEach((client, index) => {
								if (index === 0) {
									assert.equal(
										client.signalCount,
										1,
										"User 1 should have received 1 signal",
									);
									assert.equal(
										user1Signal.content,
										"TargetSignal",
										"User 1 signal content mismatch",
									);
								} else {
									assert.equal(
										client.signalCount,
										0,
										`User ${index + 1} should not have received any signals`,
									);
								}
							});
						});

						it("Verify broadcast signal", async () => {
							const broadcastSignal: ISentSignalMessage = {
								content: "BroadcastSignal",
								clientConnectionNumber: 1,
								referenceSequenceNumber: 1,
							};

							clients[0].socket.send("submitSignal", clients[0].clientId, [
								broadcastSignal,
							]);

							const userSignals = await Promise.all(
								clients.map((client) => client.signalPromise),
							);

							clients.forEach((client, index) => {
								assert.equal(
									client.signalCount,
									1,
									`User ${index + 1} should have received 1 signal`,
								);
								assert.equal(
									userSignals[index].content,
									"BroadcastSignal",
									`User ${index + 1} signal content mismatch`,
								);
							});
						});

						it("Verify mixed targeted and broadcast signals", async () => {
							const targetedSignal: ISentSignalMessage = {
								targetClientId: clients[0].clientId,
								content: stringSignalContent,
							};

							clients[1].socket.send("submitSignal", clients[1].clientId, [
								targetedSignal,
							]);

							let user1Signal = await clients[0].signalPromise;

							clients.forEach((client, index) => {
								if (index === 0) {
									assert.equal(
										client.signalCount,
										1,
										"User 1 should have received 1 signal",
									);
									assert.equal(
										user1Signal.content,
										stringSignalContent,
										"User 1 signal content mismatch",
									);
								} else {
									assert.equal(
										client.signalCount,
										0,
										`User ${index + 1} should not have received any signals`,
									);
								}
							});

							const broadcastSignal: ISentSignalMessage = {
								content: stringSignalContent,
							};

							clients[0].socket.send("submitSignal", clients[0].clientId, [
								broadcastSignal,
							]);

							user1Signal = await clients[0].signalPromise;
							const user2Signal = await clients[1].signalPromise;
							const user3Signal = await clients[2].signalPromise;

							const userSignals = [user1Signal, user2Signal, user3Signal];

							clients.forEach((client, index) => {
								if (index == 0) {
									assert.equal(
										client.signalCount,
										2,
										"User 1 should have received 2 signals",
									);
									assert.equal(
										userSignals[index].content,
										stringSignalContent,
										"User 1 signal content mismatch",
									);
								} else {
									assert.equal(
										client.signalCount,
										1,
										`User ${index + 1} should have received 1 signal`,
									);
									assert.equal(
										userSignals[index].content,
										stringSignalContent,
										`User ${index + 1} signal content mismatch`,
									);
								}
							});
						});

						it("Receiving target client disconnect", async () => {
							const targetedSignal: ISentSignalMessage = {
								targetClientId: clients[1].clientId,
								content: "TargetSignal",
							};

							clients[1].socket.disconnect();
							clients[0].socket.send("submitSignal", clients[0].clientId, [
								targetedSignal,
							]);

							await Promise.all(
								clients.map((client, index) => {
									if (index !== 1) {
										return client.signalPromise;
									}
									return createSignalNotReceivedPromise(client);
								}),
							);

							clients.forEach((client, index) => {
								if (index !== 1) {
									// Connected clients recieve 1 disconnect signal
									assert.equal(
										client.signalCount,
										1,
										`User ${index + 1} should have received 1 signal`,
									);
								} else {
									assert.equal(
										client.signalCount,
										0,
										`User ${index + 1} should not have received any signals`,
									);
								}
							});
						});

						describe("Invalid/Malformed signals", () => {
							let noSignalPromises: Promise<void>[];

							before(() => {
								noSignalPromises = clients.map((client) => {
									return new Promise<void>((resolve) => {
										client.socket.on("signal", (signal: ISignalMessage) => {
											assert.fail("Signal should not have been received");
										});
										setTimeout(resolve, 100);
									});
								});
							});

							it("Invalid targetClientID", async () => {
								const targetedSignal: ISentSignalMessage = {
									targetClientId: "invalidClientID",
									content: stringSignalContent,
								};

								clients[1].socket.send("submitSignal", clients[1].clientId, [
									targetedSignal,
								]);

								await Promise.all(noSignalPromises);
							});

							it("Invalid targetClientID type", async () => {
								const targetedSignal = {
									targetClientId: true,
									content: stringSignalContent,
								};

								clients[1].socket.send("submitSignal", clients[1].clientId, [
									targetedSignal,
								]);

								await Promise.all(noSignalPromises);
							});

							it("Missing content field", async () => {
								const targetedSignal = {
									targetClientId: clients[0].clientId,
								};

								clients[1].socket.send("submitSignal", clients[1].clientId, [
									targetedSignal,
								]);

								await Promise.all(noSignalPromises);
							});

							it("Missing content field", async () => {
								const targetedSignal = {
									targetClientId: clients[0].clientId,
								};

								clients[1].socket.send("submitSignal", clients[1].clientId, [
									targetedSignal,
								]);

								await Promise.all(noSignalPromises);
							});

							it("Invalid signal field", async () => {
								const targetedSignal = {
									targetClientId: clients[0].clientId,
									content: stringSignalContent,
									invalidField: "invalid",
								};

								clients[1].socket.send("submitSignal", clients[1].clientId, [
									targetedSignal,
								]);

								await Promise.all(noSignalPromises);
							});

							it("Invalid optional signal fields", async () => {
								const targetedSignal = {
									targetClientId: clients[0].clientId,
									content: stringSignalContent,
									clientConnectionNumber: false,
									referenceSequenceNumber: "invalid",
								};

								clients[1].socket.send("submitSignal", clients[1].clientId, [
									targetedSignal,
								]);

								await Promise.all(noSignalPromises);
							});
						});
					});
				});

				describe("#submitOp", () => {
					it("Can connect to the web socket server", async () => {
						const socket = webSocketServer.createConnection();
						const connectMessage = await connectToServer(
							testId,
							testTenantId,
							testSecret,
							socket,
						);

						const messageFactory = new MessageFactory(testId, connectMessage.clientId);
						const message = messageFactory.createDocumentMessage();

						const beforeCount = deliKafka.getRawMessages().length;
						socket.send("submitOp", connectMessage.clientId, [message]);
						assert.equal(deliKafka.getRawMessages().length, beforeCount + 1);
						const lastMessage = deliKafka.getLastMessage();
						assert.equal(lastMessage.documentId, testId);
						assert.equal(lastMessage.type, RawOperationType);
						assert.deepEqual(lastMessage.operation, message);
					});

					it("Can submit ops to the websocket server", async () => {
						const socket = webSocketServer.createConnection();
						const connectMessage = await connectToServer(
							testId,
							testTenantId,
							testSecret,
							socket,
						);

						const messageFactory = new MessageFactory(testId, connectMessage.clientId);
						let latestMessage = messageFactory.createDocumentMessage();

						const beforeCount = deliKafka.getRawMessages().length;
						socket.send("submitOp", connectMessage.clientId, [latestMessage]);
						assert.equal(
							deliKafka.getRawMessages().length,
							beforeCount + 1,
							`Incorrect message count after individual message.`,
						);
						socket.send("submitOp", connectMessage.clientId, [
							(latestMessage = messageFactory.createDocumentMessage()),
						]);
						assert.equal(
							deliKafka.getRawMessages().length,
							beforeCount + 1 + 1,
							`Incorrect message count after second individual message.`,
						);
						socket.send("submitOp", connectMessage.clientId, [
							(latestMessage = messageFactory.createDocumentMessage()),
							(latestMessage = messageFactory.createDocumentMessage()),
						]);
						assert.equal(
							deliKafka.getRawMessages().length,
							beforeCount + 1 + 1 + 2,
							`Incorrect message count after batch of individual messages.`,
						);
						const lastMessage = deliKafka.getLastMessage();
						assert.equal(lastMessage.documentId, testId);
						assert.equal(lastMessage.type, RawOperationType);
						assert.deepEqual(lastMessage.operation, latestMessage);
					});

					it("Should throttle excess submitOps for tenant", async () => {
						const socket = webSocketServer.createConnection();
						const connectMessage = await connectToServer(
							testId,
							testTenantId,
							testSecret,
							socket,
						);

						const messageFactory = new MessageFactory(testId, connectMessage.clientId);

						let i = 0;
						const deferredNack = new Deferred<INack[]>();
						socket.on("nack", (reason: string, nackMessages: INack[]) => {
							if (i < throttleLimitTenant) {
								deferredNack.reject(
									`Submit op NACK before reaching throttle limit: ${nackMessages}`,
								);
							} else {
								deferredNack.resolve(nackMessages);
							}
						});
						for (; i < throttleLimitTenant; i++) {
							const message = messageFactory.createDocumentMessage();

							const beforeCount = deliKafka.getRawMessages().length;
							socket.send("submitOp", connectMessage.clientId, [message]);
							assert.equal(deliKafka.getRawMessages().length, beforeCount + 1);
							const lastMessage = deliKafka.getLastMessage();
							assert.equal(lastMessage.documentId, testId);
							assert.equal(lastMessage.type, RawOperationType);
							assert.deepEqual(lastMessage.operation, message);
						}

						const blockedMessage = messageFactory.createDocumentMessage();
						socket.send("submitOp", connectMessage.clientId, [blockedMessage]);
						const nackMessages = await deferredNack.promise;

						const nackContent = nackMessages[0]?.content as INackContent;
						assert.strictEqual(nackContent.code, 429);
						assert.strictEqual(nackContent.type, NackErrorType.ThrottlingError);
						assert.strictEqual(nackContent.retryAfter, 1);
					});

					it("Should throttle excess submitOps (batched) for tenant", async () => {
						const socket = webSocketServer.createConnection();
						const connectMessage = await connectToServer(
							testId,
							testTenantId,
							testSecret,
							socket,
						);

						const messageFactory = new MessageFactory(testId, connectMessage.clientId);

						const deferredNack = new Deferred<INack[]>();
						socket.on("nack", (reason: string, nackMessages: INack[]) => {
							deferredNack.resolve(nackMessages);
						});
						// generate a batch of messages
						const generateMessageBatch = (size: number): IDocumentMessage[] => {
							const batch = [];
							for (let b = 0; b < size; b++) {
								const message = messageFactory.createDocumentMessage();
								batch.push(message);
							}
							return batch;
						};
						const batchSize = 2;
						for (let i = 0; i <= throttleLimitTenant - batchSize; i += batchSize) {
							// Send batches until next batch would be throttled. Otherwise error will be thrown
							const messages = generateMessageBatch(batchSize);

							const beforeCount = deliKafka.getRawMessages().length;
							// submitOp accepts (IDocumentMessage | IDocumentMessage[])[] for message batch
							socket.send("submitOp", connectMessage.clientId, messages);

							const rawMessages = deliKafka.getRawMessages();
							assert.equal(
								rawMessages.length,
								beforeCount + batchSize,
								`Incorrect message count.

Actual Messages: ${JSON.stringify(
									rawMessages.map((msg) => msg.value.operation),
									undefined,
									2,
								)}

Submitted Messages: ${JSON.stringify(messages, undefined, 2)}`,
							);

							// assert last message is equivalent to last batch message
							const lastMessage = deliKafka.getLastMessage();
							const expectedLastBatch = messages[batchSize - 1];
							const expectedLastMessage = Array.isArray(expectedLastBatch)
								? expectedLastBatch[batchSize - 1]
								: expectedLastBatch;
							assert.equal(lastMessage.documentId, testId);
							assert.equal(lastMessage.type, RawOperationType);
							assert.deepEqual(lastMessage.operation, expectedLastMessage);
						}

						const blockedMessageBatch = generateMessageBatch(batchSize);
						socket.send("submitOp", connectMessage.clientId, blockedMessageBatch);
						const nackMessages = await deferredNack.promise;

						const nackContent = nackMessages[0]?.content as INackContent;
						assert.strictEqual(nackMessages.length, 1, "Expected only 1 Nack Message");
						assert.strictEqual(nackContent.code, 429);
						assert.strictEqual(nackContent.type, NackErrorType.ThrottlingError);
						assert.strictEqual(nackContent.retryAfter, 1);
					});
				});
			});

			describe("UsageCounting", () => {
				const testTenantId = "test";
				const testSecret = "test";
				const testId = "test";
				const url = "http://test";

				let webSocketServer: LocalWebSocketServer;
				let deliKafka: TestKafka;
				let testOrderer: IOrdererManager;
				let testTenantManager: TestTenantManager;
				let testClientManager: IClientManager;

				const throttleLimitTenant = 7;
				const throttleLimitConnectDoc = 4;
				const minThrottleCheckInterval = 100;
				const testThrottleAndUsageStorageManager = new TestThrottleAndUsageStorageManager();

				beforeEach(async () => {
					// use fake timers to have full control over the passage of time
					Sinon.useFakeTimers(Date.now());

					const collectionNames = "test";
					const testData: { [key: string]: any[] } = {};

					deliKafka = new TestKafka();
					const producer = deliKafka.createProducer();
					testTenantManager = new TestTenantManager(url);
					testClientManager = new TestClientManager();
					const testDbFactory = new TestDbFactory(testData);
					const mongoManager = new MongoManager(testDbFactory);
					const globalDbEnabled = false;
					const databaseManager = new MongoDatabaseManager(
						globalDbEnabled,
						mongoManager,
						mongoManager,
						collectionNames,
						collectionNames,
						collectionNames,
						collectionNames,
						collectionNames,
					);
					const testDocumentRepository = new TestNotImplementedDocumentRepository();
					const testStorage = new services.DocumentStorage(
						testDocumentRepository,
						testTenantManager,
						false,
						await databaseManager.getDeltaCollection(undefined, undefined),
						undefined,
					);
					const kafkaOrderer = new KafkaOrdererFactory(
						producer,
						1024 * 1024,
						DefaultServiceConfiguration,
					);
					testOrderer = new OrdererManager(
						false,
						url,
						testTenantManager,
						null,
						kafkaOrderer,
					);

					const pubsub = new PubSub();
					webSocketServer = new LocalWebSocketServer(pubsub);

					const testConnectionThrottlerPerTenant = new TestThrottler(throttleLimitTenant);
					const testConnectionThrottlerPerCluster = new TestThrottler(
						throttleLimitConnectDoc,
					);
					const testSubmitOpThrottler = new TestThrottler(throttleLimitTenant);
					const throttlerHelper = new ThrottlerHelper(testThrottleAndUsageStorageManager);

					const testSubmitSignalThrottler = new Throttler(
						throttlerHelper,
						minThrottleCheckInterval,
					);

					configureWebSocketServices(
						webSocketServer,
						testOrderer,
						testTenantManager,
						testStorage,
						testClientManager,
						new DefaultMetricClient(),
						DebugLogger.create("fluid-server:TestNexusIO"),
						undefined,
						undefined,
						100,
						false,
						true,
						true,
						undefined,
						testConnectionThrottlerPerTenant,
						testConnectionThrottlerPerCluster,
						testSubmitOpThrottler,
						testSubmitSignalThrottler,
						testThrottleAndUsageStorageManager,
					);
				});

				afterEach(() => {
					Sinon.restore();
				});

				function connectToServer(
					id: string,
					tenantId: string,
					clientType: string,
					secret: string,
					socket: LocalWebSocket,
				): Promise<IConnected> {
					const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
					const token = generateToken(tenantId, id, secret, scopes);

					const client: IClient = {
						mode: undefined,
						permission: undefined,
						user: undefined,
						scopes: undefined,
						details: {
							capabilities: undefined,
							type: clientType,
						},
					};
					const connectMessage: IConnect = {
						client: client,
						id,
						mode: "write",
						tenantId,
						token,
						versions: ["^0.3.0", "^0.2.0", "^0.1.0"],
					};

					const deferred = new Deferred<IConnected>();

					socket.on("connect_document_success", (connectedMessage: IConnected) => {
						deferred.resolve(connectedMessage);
					});

					socket.on("connect_document_error", (error: any) => {
						deferred.reject(error);
					});

					socket.on("nack", (reason: string, nackMessages: INack[]) => {
						deferred.reject(nackMessages);
					});

					socket.send(
						"connect_document",
						connectMessage,
						(error: any, connectedMessage: IConnected) => {
							if (error) {
								deferred.reject(error);
							} else {
								deferred.resolve(connectedMessage);
							}
						},
					);

					return deferred.promise;
				}

				describe("connection time", () => {
					it("Should not store the summarizer client connection time upon disconnect", async () => {
						const clientConnectionTime = 100;
						const socket = webSocketServer.createConnection();
						await connectToServer(
							testId,
							testTenantId,
							"summarizer",
							testSecret,
							socket,
						);
						Sinon.clock.tick(clientConnectionTime);
						socket.send("disconnect");
						// Wait for disconnect handler to complete
						await Sinon.clock.nextAsync();

						const usageData = await testThrottleAndUsageStorageManager.getUsageData(
							clientConnectivityStorageId,
						);
						assert.equal(usageData, undefined);
					});

					it("Should store the client connection time upon disconnect", async () => {
						const clientConnectionTime = 100;
						const socket = webSocketServer.createConnection();
						const connectMessage = await connectToServer(
							testId,
							testTenantId,
							"client",
							testSecret,
							socket,
						);
						Sinon.clock.tick(clientConnectionTime);
						socket.send("disconnect");
						// Wait for disconnect handler to complete
						await Sinon.clock.nextAsync();

						const usageData = await testThrottleAndUsageStorageManager.getUsageData(
							clientConnectivityStorageId,
						);
						assert.equal(usageData.value, clientConnectionTime / 60000);
						assert.equal(usageData.clientId, connectMessage.clientId);
						assert.equal(usageData.tenantId, testTenantId);
						assert.equal(usageData.documentId, testId);
					});
				});

				describe("signal count", () => {
					it("Should store the signal count when throttler is invoked", async () => {
						const socket = webSocketServer.createConnection();
						const connectMessage = await connectToServer(
							testId,
							testTenantId,
							"client",
							testSecret,
							socket,
						);

						let i = 0;
						const signalCount = 100;
						const message = "testSignalMessage";
						for (; i < signalCount; i++) {
							socket.send("submitSignal", connectMessage.clientId, [message]);
						}
						Sinon.clock.tick(minThrottleCheckInterval + 1);
						socket.send("submitSignal", connectMessage.clientId, [message]);
						// wait for throttler to be checked
						await Sinon.clock.nextAsync();

						const usageData =
							await testThrottleAndUsageStorageManager.getUsageData(
								signalUsageStorageId,
							);
						assert.equal(usageData.value, signalCount + 1);
						assert.equal(usageData.clientId, connectMessage.clientId);
						assert.equal(usageData.tenantId, testTenantId);
						assert.equal(usageData.documentId, testId);
					});
				});
			});
		});
	});
});

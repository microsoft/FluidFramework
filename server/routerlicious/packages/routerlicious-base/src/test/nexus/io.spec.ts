/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
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
import { Deferred } from "@fluidframework/server-common-utils";
import { KafkaOrdererFactory } from "@fluidframework/server-kafka-orderer";
import { LocalWebSocket, LocalWebSocketServer } from "@fluidframework/server-local-server";
import { configureWebSocketServices } from "@fluidframework/server-lambdas";
import { LocalOrderManager, PubSub } from "@fluidframework/server-memory-orderer";
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
	type IClusterDrainingChecker,
	clusterDrainingRetryTimeInMs,
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
import {
	isNetworkError,
	type NetworkError,
	InternalErrorCode,
} from "@fluidframework/server-services-client";
import { type IRevokedTokenChecker } from "@fluidframework/server-services-core/dist/tokenRevocationManager";

const lumberjackEngine = new TestEngine1();
if (!Lumberjack.isSetupCompleted()) {
	Lumberjack.setup([lumberjackEngine]);
}

class TestClusterDrainingChecker implements IClusterDrainingChecker {
	public isDraining = false;
	public async isClusterDraining(): Promise<boolean> {
		return this.isDraining;
	}
}

class TestRevokedTokenChecker implements IRevokedTokenChecker {
	public isRevoked = false;
	public async isTokenRevoked(): Promise<boolean> {
		return this.isRevoked;
	}
}

interface TestSignalClient {
	socket: LocalWebSocket;
	clientId: string;
	signalsReceived: ISignalMessage[];
	nacksReceived: INack[];
	version: 1 | 2;
}

describe("Routerlicious", () => {
	describe("Nexus", () => {
		const testClient: IClient = {
			details: { capabilities: { interactive: true } },
			mode: "write",
			permission: [],
			scopes: [],
			user: { id: "test" },
		};
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
				let testClusterDrainingChecker: TestClusterDrainingChecker;
				let testRevokedTokenChecker: TestRevokedTokenChecker;

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
						null as unknown as LocalOrderManager,
						kafkaOrderer,
					);

					const pubsub = new PubSub();
					webSocketServer = new LocalWebSocketServer(pubsub);

					const testConnectionThrottlerPerTenant = new TestThrottler(throttleLimitTenant);
					const testConnectionThrottlerPerCluster = new TestThrottler(
						throttleLimitConnectDoc,
					);
					const testSubmitOpThrottler = new TestThrottler(throttleLimitTenant);
					testClusterDrainingChecker = new TestClusterDrainingChecker();
					testRevokedTokenChecker = new TestRevokedTokenChecker();

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
						undefined,
						undefined,
						testRevokedTokenChecker,
						undefined,
						testClusterDrainingChecker,
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
						client: testClient,
						id,
						mode: "write",
						tenantId,
						token,
						versions: ["^0.3.0", "^0.2.0", "^0.1.0"],
						supportedFeatures: v2Signals ? { submit_signals_v2: true } : {},
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

					it("Should fail when cluster is draining", async () => {
						testClusterDrainingChecker.isDraining = true;
						const socket = webSocketServer.createConnection();
						await assert.rejects(
							connectToServer(testId, testTenantId, testSecret, socket),
							(err) => {
								assert.strictEqual(isNetworkError(err), true);
								assert.strictEqual((err as NetworkError).code, 503);
								assert.strictEqual(
									(err as NetworkError).internalErrorCode,
									InternalErrorCode.ClusterDraining,
									"Error should be a have internalErrorCode set to ClusterDraining",
								);
								assert.strictEqual(
									(err as NetworkError).retryAfterMs,
									clusterDrainingRetryTimeInMs,
									"Error should have retryAfterMs set",
								);
								return true;
							},
						);
					});

					it("Should fail when token is revoked", async () => {
						testRevokedTokenChecker.isRevoked = true;
						const socket = webSocketServer.createConnection();
						await assert.rejects(
							connectToServer(testId, testTenantId, testSecret, socket),
							(err) => {
								assert.strictEqual(
									isNetworkError(err),
									true,
									"Error should be a NetworkError",
								);
								assert.strictEqual(
									(err as NetworkError).internalErrorCode,
									InternalErrorCode.TokenRevoked,
									"Error should be a have internalErrorCode set to TokenRevoked",
								);
								assert.strictEqual((err as NetworkError).code, 403);
								return true;
							},
						);
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
					async function createClient(
						testId: string,
						testTenantId: string,
						testSecret: string,
						version: 1 | 2 = 1,
					): Promise<TestSignalClient> {
						const socket = webSocketServer.createConnection();
						const connectMessage = await connectToServer(
							testId,
							testTenantId,
							testSecret,
							socket,
							version == 2 ? true : false,
						);
						const clientId = connectMessage.clientId;
						const client: TestSignalClient = {
							socket,
							clientId,
							signalsReceived: [],
							nacksReceived: [],
							version,
						};

						return client;
					}

					function listenForSignals(clients: TestSignalClient[]) {
						clients.forEach((client) => {
							client.socket.on("signal", (message: ISignalMessage) => {
								if (message.clientId !== null) {
									client.signalsReceived.push(message);
								}
							});
						});
					}

					function verifyExpectedClientSignals(
						clients: TestSignalClient[],
						expectedSignals: ISignalMessage[],
					) {
						clients.forEach((client, index) => {
							assert.equal(
								client.signalsReceived.length,
								expectedSignals.length,
								`User ${index + 1} should have received ${
									expectedSignals.length
								} signal(s)`,
							);
							expectedSignals.forEach((signal, signalIndex) => {
								const receivedSignal = client.signalsReceived[signalIndex];
								assert.deepEqual(
									receivedSignal,
									signal,
									`received signal does not match expected signal`,
								);
							});
						});
					}

					function isSentSignalMessage(obj: unknown): obj is ISentSignalMessage {
						return (
							typeof obj === "object" &&
							obj !== null &&
							"content" in obj &&
							(!("type" in obj) || typeof obj.type === "string") &&
							(!("clientConnectionNumber" in obj) ||
								typeof obj.clientConnectionNumber === "number") &&
							(!("referenceSequenceNumber" in obj) ||
								typeof obj.referenceSequenceNumber === "number") &&
							(!("targetClientId" in obj) || typeof obj.targetClientId === "string")
						);
					}

					function sendValidAndReturnExpectedSignals(
						client: TestSignalClient,
						content: unknown[],
					): ISignalMessage[] {
						const signals = content.map((c) =>
							client.version === 2 ? { content: c } : c,
						);
						return sendAndReturnExpectedSignals(client, signals);
					}

					function sendAndReturnExpectedSignals(
						client: TestSignalClient,
						signals: unknown[],
					): ISignalMessage[] {
						client.socket.send("submitSignal", client.clientId, signals);
						let expectedSignalMessages: ISignalMessage[];
						if (client.version === 2) {
							expectedSignalMessages = signals.map((signal) => {
								if (isSentSignalMessage(signal)) {
									return {
										...signal,
										clientId: client.clientId,
									};
								} else {
									// Dummy signal for v2 clients
									return {
										clientId: "invalid client ID",
										content: undefined,
									};
								}
							});
						} else {
							expectedSignalMessages = signals.map((signal) => ({
								clientId: client.clientId,
								content: signal,
							}));
						}
						return expectedSignalMessages;
					}

					function listenForNacks(client: TestSignalClient) {
						client.socket.on("nack", (reason: string, nackMessages: INack[]) => {
							client.nacksReceived.push(nackMessages[0]);
						});
					}

					function checkNack(
						client: TestSignalClient,
						expectedNackMessageContent: string,
					) {
						assert.equal(
							client.nacksReceived.length,
							1,
							"Client should have received 1 nack",
						);
						const nackMessage = client.nacksReceived[0];
						assert.equal(nackMessage.content.code, 400, "Nack code should be 400");
						assert.equal(
							nackMessage.content.type,
							NackErrorType.BadRequestError,
							"Nack type should be BadRequestError",
						);
						assert.deepEqual(
							nackMessage.content.message,
							expectedNackMessageContent,
							"Nack message should be 'Invalid signal message'",
						);
					}

					const stringSignalContent = "TestSignal";

					let clients: TestSignalClient[];

					const numberOfClients = 3; // Change the amount of clients to test with (at least 2 required)

					assert(numberOfClients > 1, "Test requires at least 2 clients");

					[
						["with v1 clients", () => 1 as const] as const,
						["with v2 clients", () => 2 as const] as const,
						[
							"with v1 and v2 clients",
							(index: number) => (1 + (index % 2)) as 1 | 2,
						] as const,
					].forEach(([description, fnVersion]) =>
						describe(description, () => {
							const clientVersion: TestSignalClient["version"][] = [];
							for (let i = 0; i < numberOfClients; i++) {
								clientVersion.push(fnVersion(i));
							}

							beforeEach(async () => {
								clients = await Promise.all(
									clientVersion.map((version) =>
										createClient(testId, testTenantId, testSecret, version),
									),
								);
								listenForSignals(clients);
							});
							describe("sending one signal", () => {
								[0, 1].forEach((clientIndex) => {
									const fromClient = `from client ${clientIndex} (v${clientVersion[clientIndex]})`;
									it(`${fromClient} should broadcast signal to all connected clients`, () => {
										const expectedSignals = sendValidAndReturnExpectedSignals(
											clients[clientIndex],
											[stringSignalContent],
										);

										verifyExpectedClientSignals(clients, expectedSignals);
									});
									it(`${fromClient} should broadcast batched signals to all connected clients`, () => {
										const expectedSignals = sendValidAndReturnExpectedSignals(
											clients[clientIndex],
											["first signal", "second signal", "third signal"],
										);

										verifyExpectedClientSignals(clients, expectedSignals);
									});
									it(`${fromClient} does not broadcast to disconnected client`, () => {
										clients[clientIndex ^ 1].socket.disconnect();
										const expectedSignals = sendValidAndReturnExpectedSignals(
											clients[clientIndex],
											[stringSignalContent],
										);
										verifyExpectedClientSignals(
											clients.filter(
												(_, index) => index !== (clientIndex ^ 1),
											),
											expectedSignals,
										);
										verifyExpectedClientSignals([clients[clientIndex ^ 1]], []);
									});
									[null, "invalid"].forEach((clientId) => {
										it(`${fromClient} should nack signal with ${clientId} client ID`, () => {
											listenForNacks(clients[clientIndex]);
											clients[clientIndex].socket.send(
												"submitSignal",
												clientId,
												[stringSignalContent],
											);
											checkNack(clients[clientIndex], "Nonexistent client");
										});
									});
									it(`${fromClient} nacks signal that is not an array`, () => {
										listenForNacks(clients[clientIndex]);
										clients[clientIndex].socket.send(
											"submitSignal",
											clients[clientIndex].clientId,
											stringSignalContent,
										);
										checkNack(clients[clientIndex], "Invalid signal message");
									});
									[
										42,
										true,
										stringSignalContent,
										{ key1: "value1", key2: 42, key3: true },
									].forEach((signalContent) =>
										it(`${fromClient} should broadcast signal with ${typeof signalContent} content`, () => {
											const expectedSignals =
												sendValidAndReturnExpectedSignals(
													clients[clientIndex],
													[signalContent],
												);
											verifyExpectedClientSignals(clients, expectedSignals);
										}),
									);
								});

								if (description === "with v2 clients") {
									it("can transmit signal to a specific targeted client", () => {
										const targetedSignal: ISentSignalMessage = {
											targetClientId: clients[0].clientId,
											content: "TargetSignal",
											clientConnectionNumber: 1,
											referenceSequenceNumber: 1,
										};

										const expectedSignals = sendAndReturnExpectedSignals(
											clients[1],
											[targetedSignal],
										);
										verifyExpectedClientSignals([clients[0]], expectedSignals);
										verifyExpectedClientSignals(
											clients.filter((_, index) => index !== 0),
											[],
										);
									});

									it("drops signal on targeted client disconnect", () => {
										const targetedSignal: ISentSignalMessage = {
											targetClientId: clients[1].clientId,
											content: "TargetSignal",
										};

										clients[1].socket.disconnect();
										sendAndReturnExpectedSignals(clients[0], [targetedSignal]);
										verifyExpectedClientSignals(clients, []);
									});
									describe("Invalid/Malformed signals", () => {
										beforeEach(() => {
											listenForNacks(clients[0]);
										});

										it("should drop signal when given an invalid target client ID", () => {
											const targetedSignal: ISentSignalMessage = {
												targetClientId: "invalidClientID",
												content: stringSignalContent,
											};

											sendAndReturnExpectedSignals(clients[0], [
												targetedSignal,
											]);

											verifyExpectedClientSignals(clients, []);
										});

										it("transmits signal with an additional signal field", () => {
											const targetedSignal = {
												targetClientId: clients[0].clientId,
												content: stringSignalContent,
												additionalField: "test field",
											};

											const expectedSignals = sendAndReturnExpectedSignals(
												clients[1],
												[targetedSignal],
											);

											verifyExpectedClientSignals(
												[clients[0]],
												expectedSignals,
											);
											verifyExpectedClientSignals(
												clients.filter((_, index) => index !== 0),
												[],
											);
										});

										it("nacks invalid targetClientID type", () => {
											const targetedSignal = {
												targetClientId: true,
												content: stringSignalContent,
											};

											sendAndReturnExpectedSignals(clients[0], [
												targetedSignal,
											]);

											checkNack(clients[0], "Invalid signal message");
										});

										it("should nack signals with invalid client ID", () => {
											const targetedSignal = {
												targetClientId: clients[1],
												content: stringSignalContent,
											};
											clients[0].socket.send(
												"submitSignal",
												"invalidClientID",
												[targetedSignal],
											);
											checkNack(clients[0], "Nonexistent client");
										});

										it("nacks missing content field", () => {
											const targetedSignal = {
												targetClientId: clients[1].clientId,
											};

											sendAndReturnExpectedSignals(clients[0], [
												targetedSignal,
											]);

											checkNack(clients[0], "Invalid signal message");
										});

										it("nacks invalid optional signal fields", () => {
											const targetedSignal = {
												targetClientId: clients[1].clientId,
												content: stringSignalContent,
												clientConnectionNumber: false,
												referenceSequenceNumber: "invalid",
											};

											sendAndReturnExpectedSignals(clients[0], [
												targetedSignal,
											]);

											checkNack(clients[0], "Invalid signal message");
										});

										it("nacks signal that is not an array", () => {
											const targetedSignal = {
												targetClientId: clients[1].clientId,
												content: stringSignalContent,
											};

											clients[0].socket.send(
												"submitSignal",
												clients[0].clientId,
												targetedSignal,
											);
											checkNack(clients[0], "Invalid signal message");
										});
									});
								} else if (description === "with v1 and v2 clients") {
									it("can target a v1 client from a v2 client", () => {
										const targetedSignal: ISentSignalMessage = {
											targetClientId: clients[0].clientId,
											content: stringSignalContent,
										};

										const expectedSignals = sendAndReturnExpectedSignals(
											clients[1],
											[targetedSignal],
										);

										verifyExpectedClientSignals([clients[0]], expectedSignals);
										verifyExpectedClientSignals(
											clients.filter((client) => client !== clients[0]),
											[],
										);
									});
								}
							});
							describe("sending multiple signals", () => {
								[0, 1].forEach((clientIndex) => {
									it("should broadcast signals sent from multiple clients to all connected clients", () => {
										const firstSignal = sendValidAndReturnExpectedSignals(
											clients[clientIndex],
											["first signal"],
										);
										const secondSignal = sendValidAndReturnExpectedSignals(
											clients[clientIndex ^ 1],
											["second signal"],
										);

										verifyExpectedClientSignals(
											clients,
											firstSignal.concat(secondSignal),
										);
									});
								});
								if (description === "with v2 clients") {
									it("can transmit both targeted and broadcast signals", () => {
										const targetedSignal: ISentSignalMessage = {
											targetClientId: clients[0].clientId,
											content: "TargetedSignal",
										};
										const broadcastSignal: ISentSignalMessage = {
											content: "BroadcastSignal",
										};

										const expectedTargetedSignals =
											sendAndReturnExpectedSignals(clients[1], [
												targetedSignal,
											]);
										const expectedBroadcastSignals =
											sendAndReturnExpectedSignals(clients[1], [
												broadcastSignal,
											]);

										verifyExpectedClientSignals(
											[clients[0]],
											expectedTargetedSignals.concat(
												expectedBroadcastSignals,
											),
										);
										verifyExpectedClientSignals(
											clients.filter((_, index) => index !== 0),
											expectedBroadcastSignals,
										);
									});
								}
							});
						}),
					);
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
							const batch: IDocumentMessage[] = [];
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
						null as unknown as LocalOrderManager,
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
					v2Signals: boolean = false,
				): Promise<IConnected> {
					const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
					const token = generateToken(tenantId, id, secret, scopes);

					const client: IClient = {
						...testClient,
						details: {
							...testClient.details,
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
						supportedFeatures: v2Signals ? { submit_signals_v2: true } : {},
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
					[1, 2].forEach((version) => {
						describe(`with v${version} signals`, () => {
							it("Should store the signal count when throttler is invoked", async () => {
								const socket = webSocketServer.createConnection();
								const connectMessage = await connectToServer(
									testId,
									testTenantId,
									"client",
									testSecret,
									socket,
									version === 2,
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
	});
});

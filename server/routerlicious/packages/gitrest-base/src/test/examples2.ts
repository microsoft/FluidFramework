/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IWholeSummaryPayload,
	IWholeFlatSummary,
	IWriteSummaryResponse,
} from "@fluidframework/server-services-client";
import { convertAllUtf8ToBase64 } from "./utils";

/*
 * Samples generated with added logging in GitWholeSummaryManager while running
 * [Fluid Chat](https://github.com/znewton/fluid-chat).
 * Then, all UTF-8 blobs are converted to base64 for Sha consistency across various summary settings.
 *
 * Flow:
 * 1. Create a new document
 * 2. Send 3 messages
 * 3. Wait until Client Summary is written
 * 4. Refresh page, resulting in new service summary
 * 5. Send 3 messages
 * 6. Wait until Client Summary is written
 */

export const ElaborateInitialPayload: IWholeSummaryPayload =
	convertAllUtf8ToBase64<IWholeSummaryPayload>({
		entries: [
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "blob",
								content: '{"minimumSequenceNumber":0,"sequenceNumber":0}',
								encoding: "utf-8",
							},
							path: "attributes",
							type: "blob",
						},
						{
							value: { type: "blob", content: "[]", encoding: "utf-8" },
							path: "quorumMembers",
							type: "blob",
						},
						{
							value: { type: "blob", content: "[]", encoding: "utf-8" },
							path: "quorumProposals",
							type: "blob",
						},
						{
							value: {
								type: "blob",
								content:
									'[["code",{"key":"code","value":{"package":"no-dynamic-package","config":{}},"approvalSequenceNumber":0,"commitSequenceNumber":0,"sequenceNumber":0}]]',
								encoding: "utf-8",
							},
							path: "quorumValues",
							type: "blob",
						},
					],
				},
				path: ".protocol",
				type: "tree",
			},
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "tree",
																	entries: [
																		{
																			value: {
																				type: "blob",
																				content:
																					'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"subdirectories":{"initial-objects-key":{"ci":{"csn":0,"ccIds":["detached"]},"storage":{"map":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/rootDOId/9f9a7c44-516d-4e1d-836f-76a4c60c439d"}},"hiddenData":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/rootDOId/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e"}},"signaler":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac"}}}}}}}',
																				encoding: "utf-8",
																			},
																			path: "header",
																			type: "blob",
																		},
																		{
																			value: {
																				type: "blob",
																				content:
																					'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-internal.7.1.0"}',
																				encoding: "utf-8",
																			},
																			path: ".attributes",
																			type: "blob",
																		},
																	],
																},
																path: "root",
																type: "tree",
															},
															{
																value: {
																	type: "tree",
																	entries: [
																		{
																			value: {
																				type: "blob",
																				content:
																					'{"blobs":[],"content":{"messages":{"type":"Plain","value":[{"id":"fdbf9e75-c481-4dce-bffc-09df275fef66","handle":{"type":"__fluid_handle__","url":"/rootDOId/4d6f49a2-2afd-44a8-9dc6-f3829a62512a"},"sender":"test-user","type":"plain-large"},{"id":"be4347b9-2a9f-4cc5-a0fb-742508115ad2","handle":{"type":"__fluid_handle__","url":"/rootDOId/ca2b5993-2de2-4c70-8ab4-03951ab31dfa"},"sender":"test-user","type":"plain-large"},{"id":"61049e1d-276d-40a6-ba45-ea0b98333454","handle":{"type":"__fluid_handle__","url":"/rootDOId/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839"},"sender":"test-user","type":"plain-large"}]}}}',
																				encoding: "utf-8",
																			},
																			path: "header",
																			type: "blob",
																		},
																		{
																			value: {
																				type: "blob",
																				content:
																					'{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"2.0.0-internal.7.1.0"}',
																				encoding: "utf-8",
																			},
																			path: ".attributes",
																			type: "blob",
																		},
																	],
																},
																path: "9f9a7c44-516d-4e1d-836f-76a4c60c439d",
																type: "tree",
															},
															{
																value: {
																	type: "tree",
																	entries: [
																		{
																			value: {
																				type: "blob",
																				content:
																					'{"blobs":[],"content":{}}',
																				encoding: "utf-8",
																			},
																			path: "header",
																			type: "blob",
																		},
																		{
																			value: {
																				type: "blob",
																				content:
																					'{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"2.0.0-internal.7.1.0"}',
																				encoding: "utf-8",
																			},
																			path: ".attributes",
																			type: "blob",
																		},
																	],
																},
																path: "1a188ef5-ca16-416d-8cf1-4f7b08dfab5e",
																type: "tree",
															},
															{
																value: {
																	type: "tree",
																	entries: [
																		{
																			value: {
																				type: "blob",
																				content:
																					'{"blobs":[],"content":{"content":{"type":"Plain","value":"test message"}}}',
																				encoding: "utf-8",
																			},
																			path: "header",
																			type: "blob",
																		},
																		{
																			value: {
																				type: "blob",
																				content:
																					'{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"2.0.0-internal.7.1.0"}',
																				encoding: "utf-8",
																			},
																			path: ".attributes",
																			type: "blob",
																		},
																	],
																},
																path: "4d6f49a2-2afd-44a8-9dc6-f3829a62512a",
																type: "tree",
															},
															{
																value: {
																	type: "tree",
																	entries: [
																		{
																			value: {
																				type: "blob",
																				content:
																					'{"blobs":[],"content":{"content":{"type":"Plain","value":"test message"}}}',
																				encoding: "utf-8",
																			},
																			path: "header",
																			type: "blob",
																		},
																		{
																			value: {
																				type: "blob",
																				content:
																					'{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"2.0.0-internal.7.1.0"}',
																				encoding: "utf-8",
																			},
																			path: ".attributes",
																			type: "blob",
																		},
																	],
																},
																path: "ca2b5993-2de2-4c70-8ab4-03951ab31dfa",
																type: "tree",
															},
															{
																value: {
																	type: "tree",
																	entries: [
																		{
																			value: {
																				type: "blob",
																				content:
																					'{"blobs":[],"content":{"content":{"type":"Plain","value":"test message"}}}',
																				encoding: "utf-8",
																			},
																			path: "header",
																			type: "blob",
																		},
																		{
																			value: {
																				type: "blob",
																				content:
																					'{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"2.0.0-internal.7.1.0"}',
																				encoding: "utf-8",
																			},
																			path: ".attributes",
																			type: "blob",
																		},
																	],
																},
																path: "33d190c4-fa6a-4d6e-b62d-e6ad44fa3839",
																type: "tree",
															},
														],
													},
													path: ".channels",
													type: "tree",
												},
												{
													value: {
														type: "blob",
														content:
															'{"pkg":"[\\"rootDO\\"]","summaryFormatVersion":2,"isRootDataStore":true}',
														encoding: "utf-8",
													},
													path: ".component",
													type: "blob",
												},
											],
										},
										path: "rootDOId",
										type: "tree",
									},
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "tree",
																	entries: [
																		{
																			value: {
																				type: "blob",
																				content:
																					'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]}}}',
																				encoding: "utf-8",
																			},
																			path: "header",
																			type: "blob",
																		},
																		{
																			value: {
																				type: "blob",
																				content:
																					'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-internal.7.1.0"}',
																				encoding: "utf-8",
																			},
																			path: ".attributes",
																			type: "blob",
																		},
																	],
																},
																path: "root",
																type: "tree",
															},
														],
													},
													path: ".channels",
													type: "tree",
												},
												{
													value: {
														type: "blob",
														content:
															'{"pkg":"[\\"rootDO\\",\\"@fluid-example/signaler\\"]","summaryFormatVersion":2,"isRootDataStore":false}',
														encoding: "utf-8",
													},
													path: ".component",
													type: "blob",
												},
											],
										},
										path: "9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac",
										type: "tree",
									},
								],
							},
							path: ".channels",
							type: "tree",
						},
						{
							value: {
								type: "blob",
								content:
									'{"createContainerRuntimeVersion":"2.0.0-internal.7.1.0","createContainerTimestamp":1704316414678,"summaryNumber":1,"summaryFormatVersion":1,"gcFeature":3,"sessionExpiryTimeoutMs":2592000000,"sweepEnabled":false,"sweepTimeoutMs":3110400000,"telemetryDocumentId":"2c6fdb36-6b4a-4cba-afc4-cccd51e018dd"}',
								encoding: "utf-8",
							},
							path: ".metadata",
							type: "blob",
						},
						{
							value: {
								type: "blob",
								content: '{"electionSequenceNumber":0}',
								encoding: "utf-8",
							},
							path: ".electedSummarizer",
							type: "blob",
						},
					],
				},
				path: ".app",
				type: "tree",
			},
		],
		sequenceNumber: 0,
		type: "container",
	});

export const ElaborateInitialResult: IWholeFlatSummary = convertAllUtf8ToBase64<IWholeFlatSummary>({
	id: "c88b2573fdd22c6861d5f39bce4f58e61a451a21",
	trees: [
		{
			id: "53a848178c085363e44dfd1be7b2b172a8268f42",
			entries: [
				{ type: "tree", path: ".app" },
				{ type: "tree", path: ".app/.channels" },
				{ type: "tree", path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac" },
				{
					type: "tree",
					path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.channels",
				},
				{
					type: "tree",
					path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.channels/root",
				},
				{
					type: "blob",
					id: "faf720750d1bfe4304b808733b97f7495f6beedc",
					path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.channels/root/.attributes",
				},
				{
					type: "blob",
					id: "a8f0e0d709d42b998767dcc4a82a4e96bec819a2",
					path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.channels/root/header",
				},
				{
					type: "blob",
					id: "c0e6e1c73bfd42e2a47071489ad8a41a3b62af1c",
					path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.component",
				},
				{ type: "tree", path: ".app/.channels/rootDOId" },
				{ type: "tree", path: ".app/.channels/rootDOId/.channels" },
				{
					type: "tree",
					path: ".app/.channels/rootDOId/.channels/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e",
				},
				{
					type: "blob",
					id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
					path: ".app/.channels/rootDOId/.channels/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e/.attributes",
				},
				{
					type: "blob",
					id: "f39311cc21cd0c2ebf40677800a8033b1fd02404",
					path: ".app/.channels/rootDOId/.channels/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e/header",
				},
				{
					type: "tree",
					path: ".app/.channels/rootDOId/.channels/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839",
				},
				{
					type: "blob",
					id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
					path: ".app/.channels/rootDOId/.channels/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839/.attributes",
				},
				{
					type: "blob",
					id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
					path: ".app/.channels/rootDOId/.channels/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839/header",
				},
				{
					type: "tree",
					path: ".app/.channels/rootDOId/.channels/4d6f49a2-2afd-44a8-9dc6-f3829a62512a",
				},
				{
					type: "blob",
					id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
					path: ".app/.channels/rootDOId/.channels/4d6f49a2-2afd-44a8-9dc6-f3829a62512a/.attributes",
				},
				{
					type: "blob",
					id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
					path: ".app/.channels/rootDOId/.channels/4d6f49a2-2afd-44a8-9dc6-f3829a62512a/header",
				},
				{
					type: "tree",
					path: ".app/.channels/rootDOId/.channels/9f9a7c44-516d-4e1d-836f-76a4c60c439d",
				},
				{
					type: "blob",
					id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
					path: ".app/.channels/rootDOId/.channels/9f9a7c44-516d-4e1d-836f-76a4c60c439d/.attributes",
				},
				{
					type: "blob",
					id: "212351c1a6eebf8d35f0d6dac87310437e1c9ae9",
					path: ".app/.channels/rootDOId/.channels/9f9a7c44-516d-4e1d-836f-76a4c60c439d/header",
				},
				{
					type: "tree",
					path: ".app/.channels/rootDOId/.channels/ca2b5993-2de2-4c70-8ab4-03951ab31dfa",
				},
				{
					type: "blob",
					id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
					path: ".app/.channels/rootDOId/.channels/ca2b5993-2de2-4c70-8ab4-03951ab31dfa/.attributes",
				},
				{
					type: "blob",
					id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
					path: ".app/.channels/rootDOId/.channels/ca2b5993-2de2-4c70-8ab4-03951ab31dfa/header",
				},
				{ type: "tree", path: ".app/.channels/rootDOId/.channels/root" },
				{
					type: "blob",
					id: "faf720750d1bfe4304b808733b97f7495f6beedc",
					path: ".app/.channels/rootDOId/.channels/root/.attributes",
				},
				{
					type: "blob",
					id: "9a1f74bd4b0748c2311d3d60866369c769810c26",
					path: ".app/.channels/rootDOId/.channels/root/header",
				},
				{
					type: "blob",
					id: "c35bbe00f9cb9ee99c8af3d4757411abdda3d8f3",
					path: ".app/.channels/rootDOId/.component",
				},
				{
					type: "blob",
					id: "281a05982b6d4d03bc3df509ecdbc22a196cc69a",
					path: ".app/.electedSummarizer",
				},
				{
					type: "blob",
					id: "70df906273b84d16d9a2dbb5eda5553f649042d2",
					path: ".app/.metadata",
				},
				{ type: "tree", path: ".protocol" },
				{
					type: "blob",
					id: "0050eb3b8e41f9ecdf14c2aa21706018474c3b78",
					path: ".protocol/attributes",
				},
				{
					type: "blob",
					id: "0637a088a01e8ddab3bf3fa98dbe804cbde1a0dc",
					path: ".protocol/quorumMembers",
				},
				{
					type: "blob",
					id: "0637a088a01e8ddab3bf3fa98dbe804cbde1a0dc",
					path: ".protocol/quorumProposals",
				},
				{
					type: "blob",
					id: "c730f7a6ff8c606cc2b7d083e5a9705bff0d7029",
					path: ".protocol/quorumValues",
				},
			],
		},
	],
	blobs: [
		{
			content:
				'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-internal.7.1.0"}',
			encoding: "utf-8",
			id: "faf720750d1bfe4304b808733b97f7495f6beedc",
			size: 124,
		},
		{
			content: '{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]}}}',
			encoding: "utf-8",
			id: "a8f0e0d709d42b998767dcc4a82a4e96bec819a2",
			size: 50,
		},
		{
			content:
				'{"pkg":"[\\"rootDO\\",\\"@fluid-example/signaler\\"]","summaryFormatVersion":2,"isRootDataStore":false}',
			encoding: "utf-8",
			id: "c0e6e1c73bfd42e2a47071489ad8a41a3b62af1c",
			size: 99,
		},
		{
			content:
				'{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"2.0.0-internal.7.1.0"}',
			encoding: "utf-8",
			id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
			size: 118,
		},
		{
			content: '{"blobs":[],"content":{}}',
			encoding: "utf-8",
			id: "f39311cc21cd0c2ebf40677800a8033b1fd02404",
			size: 25,
		},
		{
			content:
				'{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"2.0.0-internal.7.1.0"}',
			encoding: "utf-8",
			id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
			size: 118,
		},
		{
			content: '{"blobs":[],"content":{"content":{"type":"Plain","value":"test message"}}}',
			encoding: "utf-8",
			id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
			size: 74,
		},
		{
			content:
				'{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"2.0.0-internal.7.1.0"}',
			encoding: "utf-8",
			id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
			size: 118,
		},
		{
			content: '{"blobs":[],"content":{"content":{"type":"Plain","value":"test message"}}}',
			encoding: "utf-8",
			id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
			size: 74,
		},
		{
			content:
				'{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"2.0.0-internal.7.1.0"}',
			encoding: "utf-8",
			id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
			size: 118,
		},
		{
			content:
				'{"blobs":[],"content":{"messages":{"type":"Plain","value":[{"id":"fdbf9e75-c481-4dce-bffc-09df275fef66","handle":{"type":"__fluid_handle__","url":"/rootDOId/4d6f49a2-2afd-44a8-9dc6-f3829a62512a"},"sender":"test-user","type":"plain-large"},{"id":"be4347b9-2a9f-4cc5-a0fb-742508115ad2","handle":{"type":"__fluid_handle__","url":"/rootDOId/ca2b5993-2de2-4c70-8ab4-03951ab31dfa"},"sender":"test-user","type":"plain-large"},{"id":"61049e1d-276d-40a6-ba45-ea0b98333454","handle":{"type":"__fluid_handle__","url":"/rootDOId/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839"},"sender":"test-user","type":"plain-large"}]}}}',
			encoding: "utf-8",
			id: "212351c1a6eebf8d35f0d6dac87310437e1c9ae9",
			size: 602,
		},
		{
			content:
				'{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"2.0.0-internal.7.1.0"}',
			encoding: "utf-8",
			id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
			size: 118,
		},
		{
			content: '{"blobs":[],"content":{"content":{"type":"Plain","value":"test message"}}}',
			encoding: "utf-8",
			id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
			size: 74,
		},
		{
			content:
				'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-internal.7.1.0"}',
			encoding: "utf-8",
			id: "faf720750d1bfe4304b808733b97f7495f6beedc",
			size: 124,
		},
		{
			content:
				'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"subdirectories":{"initial-objects-key":{"ci":{"csn":0,"ccIds":["detached"]},"storage":{"map":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/rootDOId/9f9a7c44-516d-4e1d-836f-76a4c60c439d"}},"hiddenData":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/rootDOId/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e"}},"signaler":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac"}}}}}}}',
			encoding: "utf-8",
			id: "9a1f74bd4b0748c2311d3d60866369c769810c26",
			size: 486,
		},
		{
			content: '{"pkg":"[\\"rootDO\\"]","summaryFormatVersion":2,"isRootDataStore":true}',
			encoding: "utf-8",
			id: "c35bbe00f9cb9ee99c8af3d4757411abdda3d8f3",
			size: 70,
		},
		{
			content: '{"electionSequenceNumber":0}',
			encoding: "utf-8",
			id: "281a05982b6d4d03bc3df509ecdbc22a196cc69a",
			size: 28,
		},
		{
			content:
				'{"createContainerRuntimeVersion":"2.0.0-internal.7.1.0","createContainerTimestamp":1704316414678,"summaryNumber":1,"summaryFormatVersion":1,"gcFeature":3,"sessionExpiryTimeoutMs":2592000000,"sweepEnabled":false,"sweepTimeoutMs":3110400000,"telemetryDocumentId":"2c6fdb36-6b4a-4cba-afc4-cccd51e018dd"}',
			encoding: "utf-8",
			id: "70df906273b84d16d9a2dbb5eda5553f649042d2",
			size: 300,
		},
		{
			content: '{"minimumSequenceNumber":0,"sequenceNumber":0}',
			encoding: "utf-8",
			id: "0050eb3b8e41f9ecdf14c2aa21706018474c3b78",
			size: 46,
		},
		{
			content: "[]",
			encoding: "utf-8",
			id: "0637a088a01e8ddab3bf3fa98dbe804cbde1a0dc",
			size: 2,
		},
		{
			content: "[]",
			encoding: "utf-8",
			id: "0637a088a01e8ddab3bf3fa98dbe804cbde1a0dc",
			size: 2,
		},
		{
			content:
				'[["code",{"key":"code","value":{"package":"no-dynamic-package","config":{}},"approvalSequenceNumber":0,"commitSequenceNumber":0,"sequenceNumber":0}]]',
			encoding: "utf-8",
			id: "c730f7a6ff8c606cc2b7d083e5a9705bff0d7029",
			size: 149,
		},
	],
});

export const ElaborateFirstChannelPayload: IWholeSummaryPayload =
	convertAllUtf8ToBase64<IWholeSummaryPayload>({
		entries: [
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]}}}',
																	encoding: "utf-8",
																},
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-internal.7.1.0"}',
																	encoding: "utf-8",
																},
																path: ".attributes",
																type: "blob",
															},
														],
													},
													path: "root",
													type: "tree",
												},
											],
										},
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\",\\"@fluid-example/signaler\\"]","summaryFormatVersion":2,"isRootDataStore":false}',
											encoding: "utf-8",
										},
										path: ".component",
										type: "blob",
									},
								],
							},
							path: "9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac",
							type: "tree",
						},
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{}}',
																	encoding: "utf-8",
																},
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"2.0.0-internal.7.1.0"}',
																	encoding: "utf-8",
																},
																path: ".attributes",
																type: "blob",
															},
														],
													},
													path: "1a188ef5-ca16-416d-8cf1-4f7b08dfab5e",
													type: "tree",
												},
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"content":{"type":"Plain","value":"test message"}}}',
																	encoding: "utf-8",
																},
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"2.0.0-internal.7.1.0"}',
																	encoding: "utf-8",
																},
																path: ".attributes",
																type: "blob",
															},
														],
													},
													path: "33d190c4-fa6a-4d6e-b62d-e6ad44fa3839",
													type: "tree",
												},
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"content":{"type":"Plain","value":"test message"}}}',
																	encoding: "utf-8",
																},
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"2.0.0-internal.7.1.0"}',
																	encoding: "utf-8",
																},
																path: ".attributes",
																type: "blob",
															},
														],
													},
													path: "4d6f49a2-2afd-44a8-9dc6-f3829a62512a",
													type: "tree",
												},
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"messages":{"type":"Plain","value":[{"id":"fdbf9e75-c481-4dce-bffc-09df275fef66","handle":{"type":"__fluid_handle__","url":"/rootDOId/4d6f49a2-2afd-44a8-9dc6-f3829a62512a"},"sender":"test-user","type":"plain-large"},{"id":"be4347b9-2a9f-4cc5-a0fb-742508115ad2","handle":{"type":"__fluid_handle__","url":"/rootDOId/ca2b5993-2de2-4c70-8ab4-03951ab31dfa"},"sender":"test-user","type":"plain-large"},{"id":"61049e1d-276d-40a6-ba45-ea0b98333454","handle":{"type":"__fluid_handle__","url":"/rootDOId/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839"},"sender":"test-user","type":"plain-large"},{"id":"9eea95e6-47b4-4421-a3e4-6cbc1d2e9f1f","sender":"willowy-tan-vulture","type":"plain","content":"commodo eiusmod consequat cupidatat"},{"id":"b8b57680-79ce-40d1-b8de-6312220d2940","sender":"willowy-tan-vulture","type":"plain","content":"Laboris fugiat Lorem commodo duis labore officia aute laboris qui id labore eiusmod nulla."},{"id":"a635fcb4-7843-4b54-8e9c-ef1c53bfe112","sender":"liquid-emerald-ocelot","type":"plain","content":"Consequat exercitation cillum ut in dolor cupidatat occaecat labore exercitation aliqua."}]}}}',
																	encoding: "utf-8",
																},
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"2.0.0-internal.7.1.0"}',
																	encoding: "utf-8",
																},
																path: ".attributes",
																type: "blob",
															},
														],
													},
													path: "9f9a7c44-516d-4e1d-836f-76a4c60c439d",
													type: "tree",
												},
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"content":{"type":"Plain","value":"test message"}}}',
																	encoding: "utf-8",
																},
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"2.0.0-internal.7.1.0"}',
																	encoding: "utf-8",
																},
																path: ".attributes",
																type: "blob",
															},
														],
													},
													path: "ca2b5993-2de2-4c70-8ab4-03951ab31dfa",
													type: "tree",
												},
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"subdirectories":{"initial-objects-key":{"ci":{"csn":0,"ccIds":["detached"]},"storage":{"map":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/rootDOId/9f9a7c44-516d-4e1d-836f-76a4c60c439d"}},"hiddenData":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/rootDOId/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e"}},"signaler":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac"}}}}}}}',
																	encoding: "utf-8",
																},
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-internal.7.1.0"}',
																	encoding: "utf-8",
																},
																path: ".attributes",
																type: "blob",
															},
														],
													},
													path: "root",
													type: "tree",
												},
											],
										},
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\"]","summaryFormatVersion":2,"isRootDataStore":true}',
											encoding: "utf-8",
										},
										path: ".component",
										type: "blob",
									},
								],
							},
							path: "rootDOId",
							type: "tree",
						},
					],
				},
				path: ".channels",
				type: "tree",
			},
			{
				value: {
					type: "blob",
					content:
						'{"createContainerRuntimeVersion":"2.0.0-internal.7.1.0","createContainerTimestamp":1704316414678,"summaryNumber":2,"summaryFormatVersion":1,"gcFeature":3,"sessionExpiryTimeoutMs":2592000000,"sweepEnabled":false,"sweepTimeoutMs":3110400000,"message":{"clientId":null,"clientSequenceNumber":-1,"minimumSequenceNumber":3,"referenceSequenceNumber":-1,"sequenceNumber":5,"timestamp":1704316420318,"type":"join"},"telemetryDocumentId":"2c6fdb36-6b4a-4cba-afc4-cccd51e018dd"}',
					encoding: "utf-8",
				},
				path: ".metadata",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content:
						'{"electedClientId":"caae108d-fcd3-40c1-9581-a73c34c77385","electedParentId":"bce1157b-b9d8-4dd6-b285-f0bc9797323b","electionSequenceNumber":5}',
					encoding: "utf-8",
				},
				path: ".electedSummarizer",
				type: "blob",
			},
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "blob",
								content:
									'{"gcNodes":{"/":{"outboundRoutes":["/rootDOId"]},"/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac":{"outboundRoutes":["/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/root"]},"/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/root":{"outboundRoutes":["/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac"]},"/rootDOId":{"outboundRoutes":["/rootDOId/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e","/rootDOId/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839","/rootDOId/4d6f49a2-2afd-44a8-9dc6-f3829a62512a","/rootDOId/9f9a7c44-516d-4e1d-836f-76a4c60c439d","/rootDOId/ca2b5993-2de2-4c70-8ab4-03951ab31dfa","/rootDOId/root"]},"/rootDOId/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e":{"outboundRoutes":["/rootDOId"]},"/rootDOId/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839":{"outboundRoutes":["/rootDOId"]},"/rootDOId/4d6f49a2-2afd-44a8-9dc6-f3829a62512a":{"outboundRoutes":["/rootDOId"]},"/rootDOId/9f9a7c44-516d-4e1d-836f-76a4c60c439d":{"outboundRoutes":["/rootDOId","/rootDOId/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839","/rootDOId/4d6f49a2-2afd-44a8-9dc6-f3829a62512a","/rootDOId/ca2b5993-2de2-4c70-8ab4-03951ab31dfa"]},"/rootDOId/ca2b5993-2de2-4c70-8ab4-03951ab31dfa":{"outboundRoutes":["/rootDOId"]},"/rootDOId/root":{"outboundRoutes":["/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac","/rootDOId","/rootDOId/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e","/rootDOId/9f9a7c44-516d-4e1d-836f-76a4c60c439d"]}}}',
								encoding: "utf-8",
							},
							path: "__gc_root",
							type: "blob",
						},
					],
				},
				path: "gc",
				type: "tree",
			},
		],
		message: "",
		sequenceNumber: 0,
		type: "channel",
	});

export const ElaborateFirstChannelResult: IWriteSummaryResponse = {
	id: "6ec720df3b5bb67de7236d78e96d5e5be0ac2e7f",
};

export const ElaborateFirstContainerPayload: IWholeSummaryPayload =
	convertAllUtf8ToBase64<IWholeSummaryPayload>({
		entries: [
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "blob",
								content:
									'[["bce1157b-b9d8-4dd6-b285-f0bc9797323b",{"client":{"details":{"capabilities":{"interactive":true},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0"},"permission":[],"scopes":["doc:read","doc:write"],"user":{"id":""},"mode":"write","timestamp":1704316415165},"sequenceNumber":1}],["caae108d-fcd3-40c1-9581-a73c34c77385",{"client":{"details":{"capabilities":{"interactive":false},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0","type":"summarizer"},"permission":[],"scopes":["doc:read","doc:write","summary:write"],"user":{"id":""},"mode":"write","timestamp":1704316420313},"sequenceNumber":5}]]',
								encoding: "utf-8",
							},
							path: "quorumMembers",
							type: "blob",
						},
						{
							value: { type: "blob", content: "[]", encoding: "utf-8" },
							path: "quorumProposals",
							type: "blob",
						},
						{
							value: {
								type: "blob",
								content:
									'[["code",{"key":"code","value":{"package":"no-dynamic-package","config":{}},"approvalSequenceNumber":0,"commitSequenceNumber":0,"sequenceNumber":0}]]',
								encoding: "utf-8",
							},
							path: "quorumValues",
							type: "blob",
						},
						{
							value: {
								type: "blob",
								content: '{"minimumSequenceNumber":3,"sequenceNumber":5}',
								encoding: "utf-8",
							},
							path: "attributes",
							type: "blob",
						},
					],
				},
				path: ".protocol",
				type: "tree",
			},
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "blob",
								content:
									'[{"clientId":"caae108d-fcd3-40c1-9581-a73c34c77385","clientSequenceNumber":1,"contents":"{\\"handle\\":\\"6ec720df3b5bb67de7236d78e96d5e5be0ac2e7f\\",\\"head\\":\\"c88b2573fdd22c6861d5f39bce4f58e61a451a21\\",\\"message\\":\\"Summary @5:3\\",\\"parents\\":[\\"c88b2573fdd22c6861d5f39bce4f58e61a451a21\\"],\\"details\\":{\\"includesProtocolTree\\":false}}","minimumSequenceNumber":5,"referenceSequenceNumber":5,"sequenceNumber":6,"timestamp":1704316450731,"traces":[],"type":"summarize","additionalContent":"{\\"clients\\":[{\\"canEvict\\":true,\\"clientId\\":\\"bce1157b-b9d8-4dd6-b285-f0bc9797323b\\",\\"clientSequenceNumber\\":4,\\"lastUpdate\\":1704316422006,\\"nack\\":false,\\"referenceSequenceNumber\\":5,\\"scopes\\":[\\"doc:read\\",\\"doc:write\\"]},{\\"canEvict\\":true,\\"clientId\\":\\"caae108d-fcd3-40c1-9581-a73c34c77385\\",\\"clientSequenceNumber\\":1,\\"lastUpdate\\":1704316450731,\\"nack\\":false,\\"referenceSequenceNumber\\":5,\\"scopes\\":[\\"doc:read\\",\\"doc:write\\",\\"summary:write\\"]}],\\"durableSequenceNumber\\":0,\\"expHash1\\":\\"4a40d777\\",\\"logOffset\\":51,\\"sequenceNumber\\":6,\\"signalClientConnectionNumber\\":0,\\"lastSentMSN\\":3,\\"nackMessages\\":[],\\"successfullyStartedLambdas\\":[\\"Scribe\\"],\\"checkpointTimestamp\\":1704316450825}","expHash1":"1afb5e42"}]',
								encoding: "utf-8",
							},
							path: "logTail",
							type: "blob",
						},
					],
				},
				path: ".logTail",
				type: "tree",
			},
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "blob",
								content:
									'{"clients":[{"canEvict":true,"clientId":"bce1157b-b9d8-4dd6-b285-f0bc9797323b","clientSequenceNumber":4,"lastUpdate":1704316422006,"nack":false,"referenceSequenceNumber":5,"scopes":["doc:read","doc:write"]},{"canEvict":true,"clientId":"caae108d-fcd3-40c1-9581-a73c34c77385","clientSequenceNumber":1,"lastUpdate":1704316450731,"nack":false,"referenceSequenceNumber":5,"scopes":["doc:read","doc:write","summary:write"]}],"durableSequenceNumber":0,"expHash1":"4a40d777","logOffset":51,"sequenceNumber":6,"signalClientConnectionNumber":0,"lastSentMSN":3,"nackMessages":[],"successfullyStartedLambdas":["Scribe"],"checkpointTimestamp":1704316450825}',
								encoding: "utf-8",
							},
							path: "deli",
							type: "blob",
						},
						{
							value: {
								type: "blob",
								content:
									'{"lastSummarySequenceNumber":0,"logOffset":39,"minimumSequenceNumber":5,"protocolState":{"sequenceNumber":5,"minimumSequenceNumber":3,"members":[["bce1157b-b9d8-4dd6-b285-f0bc9797323b",{"client":{"details":{"capabilities":{"interactive":true},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0"},"permission":[],"scopes":["doc:read","doc:write"],"user":{"id":""},"mode":"write","timestamp":1704316415165},"sequenceNumber":1}],["caae108d-fcd3-40c1-9581-a73c34c77385",{"client":{"details":{"capabilities":{"interactive":false},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0","type":"summarizer"},"permission":[],"scopes":["doc:read","doc:write","summary:write"],"user":{"id":""},"mode":"write","timestamp":1704316420313},"sequenceNumber":5}]],"proposals":[],"values":[["code",{"key":"code","value":{"package":"no-dynamic-package","config":{}},"approvalSequenceNumber":0,"commitSequenceNumber":0,"sequenceNumber":0}]]},"sequenceNumber":6,"validParentSummaries":["c88b2573fdd22c6861d5f39bce4f58e61a451a21"],"isCorrupt":false}',
								encoding: "utf-8",
							},
							path: "scribe",
							type: "blob",
						},
					],
				},
				path: ".serviceProtocol",
				type: "tree",
			},
			{ path: ".app", type: "tree", id: "6ec720df3b5bb67de7236d78e96d5e5be0ac2e7f" },
		],
		sequenceNumber: 5,
		type: "container",
	});

export const ElaborateFirstContainerResult: IWholeFlatSummary =
	convertAllUtf8ToBase64<IWholeFlatSummary>({
		id: "b3e89845a872e0b656bb41eaa8b162076551762c",
		trees: [
			{
				id: "72c8745c471af6728e9a17dabceb8192508c8903",
				entries: [
					{ type: "tree", path: ".app" },
					{ type: "tree", path: ".app/.channels" },
					{
						type: "tree",
						path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac",
					},
					{
						type: "tree",
						path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.channels",
					},
					{
						type: "tree",
						path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.channels/root",
					},
					{
						type: "blob",
						id: "faf720750d1bfe4304b808733b97f7495f6beedc",
						path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.channels/root/.attributes",
					},
					{
						type: "blob",
						id: "a8f0e0d709d42b998767dcc4a82a4e96bec819a2",
						path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.channels/root/header",
					},
					{
						type: "blob",
						id: "c0e6e1c73bfd42e2a47071489ad8a41a3b62af1c",
						path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.component",
					},
					{ type: "tree", path: ".app/.channels/rootDOId" },
					{ type: "tree", path: ".app/.channels/rootDOId/.channels" },
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e/.attributes",
					},
					{
						type: "blob",
						id: "f39311cc21cd0c2ebf40677800a8033b1fd02404",
						path: ".app/.channels/rootDOId/.channels/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839/.attributes",
					},
					{
						type: "blob",
						id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
						path: ".app/.channels/rootDOId/.channels/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/4d6f49a2-2afd-44a8-9dc6-f3829a62512a",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/4d6f49a2-2afd-44a8-9dc6-f3829a62512a/.attributes",
					},
					{
						type: "blob",
						id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
						path: ".app/.channels/rootDOId/.channels/4d6f49a2-2afd-44a8-9dc6-f3829a62512a/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/9f9a7c44-516d-4e1d-836f-76a4c60c439d",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/9f9a7c44-516d-4e1d-836f-76a4c60c439d/.attributes",
					},
					{
						type: "blob",
						id: "4f4abeb67158efcf655e8f2e2d72aafa0c834dc4",
						path: ".app/.channels/rootDOId/.channels/9f9a7c44-516d-4e1d-836f-76a4c60c439d/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/ca2b5993-2de2-4c70-8ab4-03951ab31dfa",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/ca2b5993-2de2-4c70-8ab4-03951ab31dfa/.attributes",
					},
					{
						type: "blob",
						id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
						path: ".app/.channels/rootDOId/.channels/ca2b5993-2de2-4c70-8ab4-03951ab31dfa/header",
					},
					{ type: "tree", path: ".app/.channels/rootDOId/.channels/root" },
					{
						type: "blob",
						id: "faf720750d1bfe4304b808733b97f7495f6beedc",
						path: ".app/.channels/rootDOId/.channels/root/.attributes",
					},
					{
						type: "blob",
						id: "9a1f74bd4b0748c2311d3d60866369c769810c26",
						path: ".app/.channels/rootDOId/.channels/root/header",
					},
					{
						type: "blob",
						id: "c35bbe00f9cb9ee99c8af3d4757411abdda3d8f3",
						path: ".app/.channels/rootDOId/.component",
					},
					{
						type: "blob",
						id: "8e746e856fe3981ebbf0d9d1fc8b5749bd9ebba3",
						path: ".app/.electedSummarizer",
					},
					{
						type: "blob",
						id: "59f23c5f7089043e5d45b5d013a2b128fc83e77f",
						path: ".app/.metadata",
					},
					{ type: "tree", path: ".app/gc" },
					{
						type: "blob",
						id: "0c894d75adf93abcc7608cd4fe2ad675160c6126",
						path: ".app/gc/__gc_root",
					},
					{ type: "tree", path: ".logTail" },
					{
						type: "blob",
						id: "703dc6f01797aa1deb6d748647a7b449f3bf7c13",
						path: ".logTail/logTail",
					},
					{ type: "tree", path: ".protocol" },
					{
						type: "blob",
						id: "a29c143075493f2cbe87ad191c0c8b21121cc706",
						path: ".protocol/attributes",
					},
					{
						type: "blob",
						id: "dc855cffa6220b2e0307ba2a7d40b4a3eae19ace",
						path: ".protocol/quorumMembers",
					},
					{
						type: "blob",
						id: "0637a088a01e8ddab3bf3fa98dbe804cbde1a0dc",
						path: ".protocol/quorumProposals",
					},
					{
						type: "blob",
						id: "c730f7a6ff8c606cc2b7d083e5a9705bff0d7029",
						path: ".protocol/quorumValues",
					},
					{ type: "tree", path: ".serviceProtocol" },
					{
						type: "blob",
						id: "525b85f74172505114a74bd50cb1b914db2246e4",
						path: ".serviceProtocol/deli",
					},
					{
						type: "blob",
						id: "8fa3bfebd0325f868aa5c892f1a3c7618cf51e26",
						path: ".serviceProtocol/scribe",
					},
				],
			},
		],
		blobs: [
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL2RpcmVjdG9yeSIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMSIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "faf720750d1bfe4304b808733b97f7495f6beedc",
				size: 168,
			},
			{
				content: "eyJibG9icyI6W10sImNvbnRlbnQiOnsiY2kiOnsiY3NuIjowLCJjY0lkcyI6W119fX0=",
				encoding: "base64",
				id: "a8f0e0d709d42b998767dcc4a82a4e96bec819a2",
				size: 68,
			},
			{
				content:
					"eyJwa2ciOiJbXCJyb290RE9cIixcIkBmbHVpZC1leGFtcGxlL3NpZ25hbGVyXCJdIiwic3VtbWFyeUZvcm1hdFZlcnNpb24iOjIsImlzUm9vdERhdGFTdG9yZSI6ZmFsc2V9",
				encoding: "base64",
				id: "c0e6e1c73bfd42e2a47071489ad8a41a3b62af1c",
				size: 132,
			},
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL21hcCIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMiIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
				size: 160,
			},
			{
				content: "eyJibG9icyI6W10sImNvbnRlbnQiOnt9fQ==",
				encoding: "base64",
				id: "f39311cc21cd0c2ebf40677800a8033b1fd02404",
				size: 36,
			},
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL21hcCIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMiIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
				size: 160,
			},
			{
				content:
					"eyJibG9icyI6W10sImNvbnRlbnQiOnsiY29udGVudCI6eyJ0eXBlIjoiUGxhaW4iLCJ2YWx1ZSI6InRlc3QgbWVzc2FnZSJ9fX0=",
				encoding: "base64",
				id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
				size: 100,
			},
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL21hcCIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMiIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
				size: 160,
			},
			{
				content:
					"eyJibG9icyI6W10sImNvbnRlbnQiOnsiY29udGVudCI6eyJ0eXBlIjoiUGxhaW4iLCJ2YWx1ZSI6InRlc3QgbWVzc2FnZSJ9fX0=",
				encoding: "base64",
				id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
				size: 100,
			},
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL21hcCIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMiIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
				size: 160,
			},
			{
				content:
					"eyJibG9icyI6W10sImNvbnRlbnQiOnsibWVzc2FnZXMiOnsidHlwZSI6IlBsYWluIiwidmFsdWUiOlt7ImlkIjoiZmRiZjllNzUtYzQ4MS00ZGNlLWJmZmMtMDlkZjI3NWZlZjY2IiwiaGFuZGxlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiL3Jvb3RET0lkLzRkNmY0OWEyLTJhZmQtNDRhOC05ZGM2LWYzODI5YTYyNTEyYSJ9LCJzZW5kZXIiOiJ0ZXN0LXVzZXIiLCJ0eXBlIjoicGxhaW4tbGFyZ2UifSx7ImlkIjoiYmU0MzQ3YjktMmE5Zi00Y2M1LWEwZmItNzQyNTA4MTE1YWQyIiwiaGFuZGxlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiL3Jvb3RET0lkL2NhMmI1OTkzLTJkZTItNGM3MC04YWI0LTAzOTUxYWIzMWRmYSJ9LCJzZW5kZXIiOiJ0ZXN0LXVzZXIiLCJ0eXBlIjoicGxhaW4tbGFyZ2UifSx7ImlkIjoiNjEwNDllMWQtMjc2ZC00MGE2LWJhNDUtZWEwYjk4MzMzNDU0IiwiaGFuZGxlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiL3Jvb3RET0lkLzMzZDE5MGM0LWZhNmEtNGQ2ZS1iNjJkLWU2YWQ0NGZhMzgzOSJ9LCJzZW5kZXIiOiJ0ZXN0LXVzZXIiLCJ0eXBlIjoicGxhaW4tbGFyZ2UifSx7ImlkIjoiOWVlYTk1ZTYtNDdiNC00NDIxLWEzZTQtNmNiYzFkMmU5ZjFmIiwic2VuZGVyIjoid2lsbG93eS10YW4tdnVsdHVyZSIsInR5cGUiOiJwbGFpbiIsImNvbnRlbnQiOiJjb21tb2RvIGVpdXNtb2QgY29uc2VxdWF0IGN1cGlkYXRhdCJ9LHsiaWQiOiJiOGI1NzY4MC03OWNlLTQwZDEtYjhkZS02MzEyMjIwZDI5NDAiLCJzZW5kZXIiOiJ3aWxsb3d5LXRhbi12dWx0dXJlIiwidHlwZSI6InBsYWluIiwiY29udGVudCI6IkxhYm9yaXMgZnVnaWF0IExvcmVtIGNvbW1vZG8gZHVpcyBsYWJvcmUgb2ZmaWNpYSBhdXRlIGxhYm9yaXMgcXVpIGlkIGxhYm9yZSBlaXVzbW9kIG51bGxhLiJ9LHsiaWQiOiJhNjM1ZmNiNC03ODQzLTRiNTQtOGU5Yy1lZjFjNTNiZmUxMTIiLCJzZW5kZXIiOiJsaXF1aWQtZW1lcmFsZC1vY2Vsb3QiLCJ0eXBlIjoicGxhaW4iLCJjb250ZW50IjoiQ29uc2VxdWF0IGV4ZXJjaXRhdGlvbiBjaWxsdW0gdXQgaW4gZG9sb3IgY3VwaWRhdGF0IG9jY2FlY2F0IGxhYm9yZSBleGVyY2l0YXRpb24gYWxpcXVhLiJ9XX19fQ==",
				encoding: "base64",
				id: "4f4abeb67158efcf655e8f2e2d72aafa0c834dc4",
				size: 1512,
			},
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL21hcCIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMiIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
				size: 160,
			},
			{
				content:
					"eyJibG9icyI6W10sImNvbnRlbnQiOnsiY29udGVudCI6eyJ0eXBlIjoiUGxhaW4iLCJ2YWx1ZSI6InRlc3QgbWVzc2FnZSJ9fX0=",
				encoding: "base64",
				id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
				size: 100,
			},
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL2RpcmVjdG9yeSIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMSIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "faf720750d1bfe4304b808733b97f7495f6beedc",
				size: 168,
			},
			{
				content:
					"eyJibG9icyI6W10sImNvbnRlbnQiOnsiY2kiOnsiY3NuIjowLCJjY0lkcyI6W119LCJzdWJkaXJlY3RvcmllcyI6eyJpbml0aWFsLW9iamVjdHMta2V5Ijp7ImNpIjp7ImNzbiI6MCwiY2NJZHMiOlsiZGV0YWNoZWQiXX0sInN0b3JhZ2UiOnsibWFwIjp7InR5cGUiOiJQbGFpbiIsInZhbHVlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiL3Jvb3RET0lkLzlmOWE3YzQ0LTUxNmQtNGUxZC04MzZmLTc2YTRjNjBjNDM5ZCJ9fSwiaGlkZGVuRGF0YSI6eyJ0eXBlIjoiUGxhaW4iLCJ2YWx1ZSI6eyJ0eXBlIjoiX19mbHVpZF9oYW5kbGVfXyIsInVybCI6Ii9yb290RE9JZC8xYTE4OGVmNS1jYTE2LTQxNmQtOGNmMS00ZjdiMDhkZmFiNWUifX0sInNpZ25hbGVyIjp7InR5cGUiOiJQbGFpbiIsInZhbHVlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiLzliMTgwNTlkLTQ0OWYtNGQ3YS05YjYwLWVjYmI0ZjJjYjhhYyJ9fX19fX19",
				encoding: "base64",
				id: "9a1f74bd4b0748c2311d3d60866369c769810c26",
				size: 648,
			},
			{
				content:
					"eyJwa2ciOiJbXCJyb290RE9cIl0iLCJzdW1tYXJ5Rm9ybWF0VmVyc2lvbiI6MiwiaXNSb290RGF0YVN0b3JlIjp0cnVlfQ==",
				encoding: "base64",
				id: "c35bbe00f9cb9ee99c8af3d4757411abdda3d8f3",
				size: 96,
			},
			{
				content:
					"eyJlbGVjdGVkQ2xpZW50SWQiOiJjYWFlMTA4ZC1mY2QzLTQwYzEtOTU4MS1hNzNjMzRjNzczODUiLCJlbGVjdGVkUGFyZW50SWQiOiJiY2UxMTU3Yi1iOWQ4LTRkZDYtYjI4NS1mMGJjOTc5NzMyM2IiLCJlbGVjdGlvblNlcXVlbmNlTnVtYmVyIjo1fQ==",
				encoding: "base64",
				id: "8e746e856fe3981ebbf0d9d1fc8b5749bd9ebba3",
				size: 192,
			},
			{
				content:
					"eyJjcmVhdGVDb250YWluZXJSdW50aW1lVmVyc2lvbiI6IjIuMC4wLWludGVybmFsLjcuMS4wIiwiY3JlYXRlQ29udGFpbmVyVGltZXN0YW1wIjoxNzA0MzE2NDE0Njc4LCJzdW1tYXJ5TnVtYmVyIjoyLCJzdW1tYXJ5Rm9ybWF0VmVyc2lvbiI6MSwiZ2NGZWF0dXJlIjozLCJzZXNzaW9uRXhwaXJ5VGltZW91dE1zIjoyNTkyMDAwMDAwLCJzd2VlcEVuYWJsZWQiOmZhbHNlLCJzd2VlcFRpbWVvdXRNcyI6MzExMDQwMDAwMCwibWVzc2FnZSI6eyJjbGllbnRJZCI6bnVsbCwiY2xpZW50U2VxdWVuY2VOdW1iZXIiOi0xLCJtaW5pbXVtU2VxdWVuY2VOdW1iZXIiOjMsInJlZmVyZW5jZVNlcXVlbmNlTnVtYmVyIjotMSwic2VxdWVuY2VOdW1iZXIiOjUsInRpbWVzdGFtcCI6MTcwNDMxNjQyMDMxOCwidHlwZSI6ImpvaW4ifSwidGVsZW1ldHJ5RG9jdW1lbnRJZCI6IjJjNmZkYjM2LTZiNGEtNGNiYS1hZmM0LWNjY2Q1MWUwMThkZCJ9",
				encoding: "base64",
				id: "59f23c5f7089043e5d45b5d013a2b128fc83e77f",
				size: 624,
			},
			{
				content:
					"eyJnY05vZGVzIjp7Ii8iOnsib3V0Ym91bmRSb3V0ZXMiOlsiL3Jvb3RET0lkIl19LCIvOWIxODA1OWQtNDQ5Zi00ZDdhLTliNjAtZWNiYjRmMmNiOGFjIjp7Im91dGJvdW5kUm91dGVzIjpbIi85YjE4MDU5ZC00NDlmLTRkN2EtOWI2MC1lY2JiNGYyY2I4YWMvcm9vdCJdfSwiLzliMTgwNTlkLTQ0OWYtNGQ3YS05YjYwLWVjYmI0ZjJjYjhhYy9yb290Ijp7Im91dGJvdW5kUm91dGVzIjpbIi85YjE4MDU5ZC00NDlmLTRkN2EtOWI2MC1lY2JiNGYyY2I4YWMiXX0sIi9yb290RE9JZCI6eyJvdXRib3VuZFJvdXRlcyI6WyIvcm9vdERPSWQvMWExODhlZjUtY2ExNi00MTZkLThjZjEtNGY3YjA4ZGZhYjVlIiwiL3Jvb3RET0lkLzMzZDE5MGM0LWZhNmEtNGQ2ZS1iNjJkLWU2YWQ0NGZhMzgzOSIsIi9yb290RE9JZC80ZDZmNDlhMi0yYWZkLTQ0YTgtOWRjNi1mMzgyOWE2MjUxMmEiLCIvcm9vdERPSWQvOWY5YTdjNDQtNTE2ZC00ZTFkLTgzNmYtNzZhNGM2MGM0MzlkIiwiL3Jvb3RET0lkL2NhMmI1OTkzLTJkZTItNGM3MC04YWI0LTAzOTUxYWIzMWRmYSIsIi9yb290RE9JZC9yb290Il19LCIvcm9vdERPSWQvMWExODhlZjUtY2ExNi00MTZkLThjZjEtNGY3YjA4ZGZhYjVlIjp7Im91dGJvdW5kUm91dGVzIjpbIi9yb290RE9JZCJdfSwiL3Jvb3RET0lkLzMzZDE5MGM0LWZhNmEtNGQ2ZS1iNjJkLWU2YWQ0NGZhMzgzOSI6eyJvdXRib3VuZFJvdXRlcyI6WyIvcm9vdERPSWQiXX0sIi9yb290RE9JZC80ZDZmNDlhMi0yYWZkLTQ0YTgtOWRjNi1mMzgyOWE2MjUxMmEiOnsib3V0Ym91bmRSb3V0ZXMiOlsiL3Jvb3RET0lkIl19LCIvcm9vdERPSWQvOWY5YTdjNDQtNTE2ZC00ZTFkLTgzNmYtNzZhNGM2MGM0MzlkIjp7Im91dGJvdW5kUm91dGVzIjpbIi9yb290RE9JZCIsIi9yb290RE9JZC8zM2QxOTBjNC1mYTZhLTRkNmUtYjYyZC1lNmFkNDRmYTM4MzkiLCIvcm9vdERPSWQvNGQ2ZjQ5YTItMmFmZC00NGE4LTlkYzYtZjM4MjlhNjI1MTJhIiwiL3Jvb3RET0lkL2NhMmI1OTkzLTJkZTItNGM3MC04YWI0LTAzOTUxYWIzMWRmYSJdfSwiL3Jvb3RET0lkL2NhMmI1OTkzLTJkZTItNGM3MC04YWI0LTAzOTUxYWIzMWRmYSI6eyJvdXRib3VuZFJvdXRlcyI6WyIvcm9vdERPSWQiXX0sIi9yb290RE9JZC9yb290Ijp7Im91dGJvdW5kUm91dGVzIjpbIi85YjE4MDU5ZC00NDlmLTRkN2EtOWI2MC1lY2JiNGYyY2I4YWMiLCIvcm9vdERPSWQiLCIvcm9vdERPSWQvMWExODhlZjUtY2ExNi00MTZkLThjZjEtNGY3YjA4ZGZhYjVlIiwiL3Jvb3RET0lkLzlmOWE3YzQ0LTUxNmQtNGUxZC04MzZmLTc2YTRjNjBjNDM5ZCJdfX19",
				encoding: "base64",
				id: "0c894d75adf93abcc7608cd4fe2ad675160c6126",
				size: 1736,
			},
			{
				content:
					'[{"clientId":"caae108d-fcd3-40c1-9581-a73c34c77385","clientSequenceNumber":1,"contents":"{\\"handle\\":\\"6ec720df3b5bb67de7236d78e96d5e5be0ac2e7f\\",\\"head\\":\\"c88b2573fdd22c6861d5f39bce4f58e61a451a21\\",\\"message\\":\\"Summary @5:3\\",\\"parents\\":[\\"c88b2573fdd22c6861d5f39bce4f58e61a451a21\\"],\\"details\\":{\\"includesProtocolTree\\":false}}","minimumSequenceNumber":5,"referenceSequenceNumber":5,"sequenceNumber":6,"timestamp":1704316450731,"traces":[],"type":"summarize","additionalContent":"{\\"clients\\":[{\\"canEvict\\":true,\\"clientId\\":\\"bce1157b-b9d8-4dd6-b285-f0bc9797323b\\",\\"clientSequenceNumber\\":4,\\"lastUpdate\\":1704316422006,\\"nack\\":false,\\"referenceSequenceNumber\\":5,\\"scopes\\":[\\"doc:read\\",\\"doc:write\\"]},{\\"canEvict\\":true,\\"clientId\\":\\"caae108d-fcd3-40c1-9581-a73c34c77385\\",\\"clientSequenceNumber\\":1,\\"lastUpdate\\":1704316450731,\\"nack\\":false,\\"referenceSequenceNumber\\":5,\\"scopes\\":[\\"doc:read\\",\\"doc:write\\",\\"summary:write\\"]}],\\"durableSequenceNumber\\":0,\\"expHash1\\":\\"4a40d777\\",\\"logOffset\\":51,\\"sequenceNumber\\":6,\\"signalClientConnectionNumber\\":0,\\"lastSentMSN\\":3,\\"nackMessages\\":[],\\"successfullyStartedLambdas\\":[\\"Scribe\\"],\\"checkpointTimestamp\\":1704316450825}","expHash1":"1afb5e42"}]',
				encoding: "utf-8",
				id: "703dc6f01797aa1deb6d748647a7b449f3bf7c13",
				size: 1221,
			},
			{
				content: '{"minimumSequenceNumber":3,"sequenceNumber":5}',
				encoding: "utf-8",
				id: "a29c143075493f2cbe87ad191c0c8b21121cc706",
				size: 46,
			},
			{
				content:
					'[["bce1157b-b9d8-4dd6-b285-f0bc9797323b",{"client":{"details":{"capabilities":{"interactive":true},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0"},"permission":[],"scopes":["doc:read","doc:write"],"user":{"id":""},"mode":"write","timestamp":1704316415165},"sequenceNumber":1}],["caae108d-fcd3-40c1-9581-a73c34c77385",{"client":{"details":{"capabilities":{"interactive":false},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0","type":"summarizer"},"permission":[],"scopes":["doc:read","doc:write","summary:write"],"user":{"id":""},"mode":"write","timestamp":1704316420313},"sequenceNumber":5}]]',
				encoding: "utf-8",
				id: "dc855cffa6220b2e0307ba2a7d40b4a3eae19ace",
				size: 1034,
			},
			{
				content: "[]",
				encoding: "utf-8",
				id: "0637a088a01e8ddab3bf3fa98dbe804cbde1a0dc",
				size: 2,
			},
			{
				content:
					'[["code",{"key":"code","value":{"package":"no-dynamic-package","config":{}},"approvalSequenceNumber":0,"commitSequenceNumber":0,"sequenceNumber":0}]]',
				encoding: "utf-8",
				id: "c730f7a6ff8c606cc2b7d083e5a9705bff0d7029",
				size: 149,
			},
			{
				content:
					'{"clients":[{"canEvict":true,"clientId":"bce1157b-b9d8-4dd6-b285-f0bc9797323b","clientSequenceNumber":4,"lastUpdate":1704316422006,"nack":false,"referenceSequenceNumber":5,"scopes":["doc:read","doc:write"]},{"canEvict":true,"clientId":"caae108d-fcd3-40c1-9581-a73c34c77385","clientSequenceNumber":1,"lastUpdate":1704316450731,"nack":false,"referenceSequenceNumber":5,"scopes":["doc:read","doc:write","summary:write"]}],"durableSequenceNumber":0,"expHash1":"4a40d777","logOffset":51,"sequenceNumber":6,"signalClientConnectionNumber":0,"lastSentMSN":3,"nackMessages":[],"successfullyStartedLambdas":["Scribe"],"checkpointTimestamp":1704316450825}',
				encoding: "utf-8",
				id: "525b85f74172505114a74bd50cb1b914db2246e4",
				size: 644,
			},
			{
				content:
					'{"lastSummarySequenceNumber":0,"logOffset":39,"minimumSequenceNumber":5,"protocolState":{"sequenceNumber":5,"minimumSequenceNumber":3,"members":[["bce1157b-b9d8-4dd6-b285-f0bc9797323b",{"client":{"details":{"capabilities":{"interactive":true},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0"},"permission":[],"scopes":["doc:read","doc:write"],"user":{"id":""},"mode":"write","timestamp":1704316415165},"sequenceNumber":1}],["caae108d-fcd3-40c1-9581-a73c34c77385",{"client":{"details":{"capabilities":{"interactive":false},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0","type":"summarizer"},"permission":[],"scopes":["doc:read","doc:write","summary:write"],"user":{"id":""},"mode":"write","timestamp":1704316420313},"sequenceNumber":5}]],"proposals":[],"values":[["code",{"key":"code","value":{"package":"no-dynamic-package","config":{}},"approvalSequenceNumber":0,"commitSequenceNumber":0,"sequenceNumber":0}]]},"sequenceNumber":6,"validParentSummaries":["c88b2573fdd22c6861d5f39bce4f58e61a451a21"],"isCorrupt":false}',
				encoding: "utf-8",
				id: "8fa3bfebd0325f868aa5c892f1a3c7618cf51e26",
				size: 1459,
			},
		],
	});

export const ElaborateFirstServiceContainerPayload: IWholeSummaryPayload =
	convertAllUtf8ToBase64<IWholeSummaryPayload>({
		entries: [
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "blob",
								content:
									'[{"clientId":"caae108d-fcd3-40c1-9581-a73c34c77385","clientSequenceNumber":1,"contents":"{\\"handle\\":\\"6ec720df3b5bb67de7236d78e96d5e5be0ac2e7f\\",\\"head\\":\\"c88b2573fdd22c6861d5f39bce4f58e61a451a21\\",\\"message\\":\\"Summary @5:3\\",\\"parents\\":[\\"c88b2573fdd22c6861d5f39bce4f58e61a451a21\\"],\\"details\\":{\\"includesProtocolTree\\":false}}","minimumSequenceNumber":5,"referenceSequenceNumber":5,"sequenceNumber":6,"timestamp":1704316450731,"traces":[],"type":"summarize","additionalContent":"{\\"clients\\":[{\\"canEvict\\":true,\\"clientId\\":\\"bce1157b-b9d8-4dd6-b285-f0bc9797323b\\",\\"clientSequenceNumber\\":4,\\"lastUpdate\\":1704316422006,\\"nack\\":false,\\"referenceSequenceNumber\\":5,\\"scopes\\":[\\"doc:read\\",\\"doc:write\\"]},{\\"canEvict\\":true,\\"clientId\\":\\"caae108d-fcd3-40c1-9581-a73c34c77385\\",\\"clientSequenceNumber\\":1,\\"lastUpdate\\":1704316450731,\\"nack\\":false,\\"referenceSequenceNumber\\":5,\\"scopes\\":[\\"doc:read\\",\\"doc:write\\",\\"summary:write\\"]}],\\"durableSequenceNumber\\":0,\\"expHash1\\":\\"4a40d777\\",\\"logOffset\\":51,\\"sequenceNumber\\":6,\\"signalClientConnectionNumber\\":0,\\"lastSentMSN\\":3,\\"nackMessages\\":[],\\"successfullyStartedLambdas\\":[\\"Scribe\\"],\\"checkpointTimestamp\\":1704316450825}","expHash1":"1afb5e42"},{"clientId":null,"clientSequenceNumber":-1,"contents":{"handle":"b3e89845a872e0b656bb41eaa8b162076551762c","summaryProposal":{"summarySequenceNumber":6}},"minimumSequenceNumber":5,"referenceSequenceNumber":-1,"sequenceNumber":7,"timestamp":1704316450967,"traces":[],"type":"summaryAck","data":"{\\"handle\\":\\"b3e89845a872e0b656bb41eaa8b162076551762c\\",\\"summaryProposal\\":{\\"summarySequenceNumber\\":6}}","expHash1":"500bff0e"},{"clientId":null,"clientSequenceNumber":-1,"contents":null,"minimumSequenceNumber":5,"referenceSequenceNumber":-1,"sequenceNumber":8,"timestamp":1704316517302,"traces":[],"type":"leave","data":"\\"caae108d-fcd3-40c1-9581-a73c34c77385\\"","expHash1":"-437260be"},{"clientId":null,"clientSequenceNumber":-1,"contents":null,"minimumSequenceNumber":9,"referenceSequenceNumber":-1,"sequenceNumber":9,"timestamp":1704316517303,"traces":[],"type":"leave","data":"\\"bce1157b-b9d8-4dd6-b285-f0bc9797323b\\"","expHash1":"-2b5c76e3"},{"clientId":null,"clientSequenceNumber":-1,"contents":null,"minimumSequenceNumber":10,"referenceSequenceNumber":10,"sequenceNumber":10,"timestamp":1704316517327,"traces":[],"type":"noClient","additionalContent":"{\\"clients\\":[],\\"durableSequenceNumber\\":6,\\"expHash1\\":\\"-2b5c76e3\\",\\"logOffset\\":58,\\"sequenceNumber\\":10,\\"signalClientConnectionNumber\\":0,\\"lastSentMSN\\":9,\\"nackMessages\\":[],\\"successfullyStartedLambdas\\":[\\"Scribe\\"],\\"checkpointTimestamp\\":1704316517330}","expHash1":"-5b168510"}]',
								encoding: "utf-8",
							},
							path: "logTail",
							type: "blob",
						},
					],
				},
				path: ".logTail",
				type: "tree",
			},
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "blob",
								content:
									'{"clients":[],"durableSequenceNumber":6,"expHash1":"-2b5c76e3","logOffset":58,"sequenceNumber":10,"signalClientConnectionNumber":0,"lastSentMSN":9,"nackMessages":[],"successfullyStartedLambdas":["Scribe"],"checkpointTimestamp":1704316517330}',
								encoding: "utf-8",
							},
							path: "deli",
							type: "blob",
						},
						{
							value: {
								type: "blob",
								content:
									'{"lastSummarySequenceNumber":5,"lastClientSummaryHead":"b3e89845a872e0b656bb41eaa8b162076551762c","logOffset":43,"minimumSequenceNumber":10,"protocolState":{"sequenceNumber":10,"minimumSequenceNumber":10,"members":[],"proposals":[],"values":[["code",{"key":"code","value":{"package":"no-dynamic-package","config":{}},"approvalSequenceNumber":0,"commitSequenceNumber":0,"sequenceNumber":0}]]},"sequenceNumber":10,"isCorrupt":false}',
								encoding: "utf-8",
							},
							path: "scribe",
							type: "blob",
						},
					],
				},
				path: ".serviceProtocol",
				type: "tree",
			},
			{
				path: ".protocol",
				type: "tree",
				id: "b3e89845a872e0b656bb41eaa8b162076551762c/.protocol",
			},
			{ path: ".app", type: "tree", id: "b3e89845a872e0b656bb41eaa8b162076551762c/.app" },
		],
		sequenceNumber: 10,
		type: "container",
	});

export const ElaborateFirstServiceContainerResult: IWholeFlatSummary =
	convertAllUtf8ToBase64<IWholeFlatSummary>({
		id: "eaa4ad44d5f727cb007452a61be6ba4ac612ceb8",
		trees: [
			{
				id: "231f1e67a9dea89710f14d7d1ca998f183423279",
				entries: [
					{ type: "tree", path: ".app" },
					{ type: "tree", path: ".app/.channels" },
					{
						type: "tree",
						path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac",
					},
					{
						type: "tree",
						path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.channels",
					},
					{
						type: "tree",
						path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.channels/root",
					},
					{
						type: "blob",
						id: "faf720750d1bfe4304b808733b97f7495f6beedc",
						path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.channels/root/.attributes",
					},
					{
						type: "blob",
						id: "a8f0e0d709d42b998767dcc4a82a4e96bec819a2",
						path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.channels/root/header",
					},
					{
						type: "blob",
						id: "c0e6e1c73bfd42e2a47071489ad8a41a3b62af1c",
						path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.component",
					},
					{ type: "tree", path: ".app/.channels/rootDOId" },
					{ type: "tree", path: ".app/.channels/rootDOId/.channels" },
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e/.attributes",
					},
					{
						type: "blob",
						id: "f39311cc21cd0c2ebf40677800a8033b1fd02404",
						path: ".app/.channels/rootDOId/.channels/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839/.attributes",
					},
					{
						type: "blob",
						id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
						path: ".app/.channels/rootDOId/.channels/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/4d6f49a2-2afd-44a8-9dc6-f3829a62512a",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/4d6f49a2-2afd-44a8-9dc6-f3829a62512a/.attributes",
					},
					{
						type: "blob",
						id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
						path: ".app/.channels/rootDOId/.channels/4d6f49a2-2afd-44a8-9dc6-f3829a62512a/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/9f9a7c44-516d-4e1d-836f-76a4c60c439d",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/9f9a7c44-516d-4e1d-836f-76a4c60c439d/.attributes",
					},
					{
						type: "blob",
						id: "4f4abeb67158efcf655e8f2e2d72aafa0c834dc4",
						path: ".app/.channels/rootDOId/.channels/9f9a7c44-516d-4e1d-836f-76a4c60c439d/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/ca2b5993-2de2-4c70-8ab4-03951ab31dfa",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/ca2b5993-2de2-4c70-8ab4-03951ab31dfa/.attributes",
					},
					{
						type: "blob",
						id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
						path: ".app/.channels/rootDOId/.channels/ca2b5993-2de2-4c70-8ab4-03951ab31dfa/header",
					},
					{ type: "tree", path: ".app/.channels/rootDOId/.channels/root" },
					{
						type: "blob",
						id: "faf720750d1bfe4304b808733b97f7495f6beedc",
						path: ".app/.channels/rootDOId/.channels/root/.attributes",
					},
					{
						type: "blob",
						id: "9a1f74bd4b0748c2311d3d60866369c769810c26",
						path: ".app/.channels/rootDOId/.channels/root/header",
					},
					{
						type: "blob",
						id: "c35bbe00f9cb9ee99c8af3d4757411abdda3d8f3",
						path: ".app/.channels/rootDOId/.component",
					},
					{
						type: "blob",
						id: "8e746e856fe3981ebbf0d9d1fc8b5749bd9ebba3",
						path: ".app/.electedSummarizer",
					},
					{
						type: "blob",
						id: "59f23c5f7089043e5d45b5d013a2b128fc83e77f",
						path: ".app/.metadata",
					},
					{ type: "tree", path: ".app/gc" },
					{
						type: "blob",
						id: "0c894d75adf93abcc7608cd4fe2ad675160c6126",
						path: ".app/gc/__gc_root",
					},
					{ type: "tree", path: ".logTail" },
					{
						type: "blob",
						id: "ef4cb8e9806ed99d00d431cccefdc1b17d951d9f",
						path: ".logTail/logTail",
					},
					{ type: "tree", path: ".protocol" },
					{
						type: "blob",
						id: "a29c143075493f2cbe87ad191c0c8b21121cc706",
						path: ".protocol/attributes",
					},
					{
						type: "blob",
						id: "dc855cffa6220b2e0307ba2a7d40b4a3eae19ace",
						path: ".protocol/quorumMembers",
					},
					{
						type: "blob",
						id: "0637a088a01e8ddab3bf3fa98dbe804cbde1a0dc",
						path: ".protocol/quorumProposals",
					},
					{
						type: "blob",
						id: "c730f7a6ff8c606cc2b7d083e5a9705bff0d7029",
						path: ".protocol/quorumValues",
					},
					{ type: "tree", path: ".serviceProtocol" },
					{
						type: "blob",
						id: "bfaeff630a8d2fac4c2efe92a25fb41a2f8f1d1e",
						path: ".serviceProtocol/deli",
					},
					{
						type: "blob",
						id: "38fa24fbaff198c4876aa06a522873f664e2aee7",
						path: ".serviceProtocol/scribe",
					},
				],
			},
		],
		blobs: [
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL2RpcmVjdG9yeSIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMSIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "faf720750d1bfe4304b808733b97f7495f6beedc",
				size: 168,
			},
			{
				content: "eyJibG9icyI6W10sImNvbnRlbnQiOnsiY2kiOnsiY3NuIjowLCJjY0lkcyI6W119fX0=",
				encoding: "base64",
				id: "a8f0e0d709d42b998767dcc4a82a4e96bec819a2",
				size: 68,
			},
			{
				content:
					"eyJwa2ciOiJbXCJyb290RE9cIixcIkBmbHVpZC1leGFtcGxlL3NpZ25hbGVyXCJdIiwic3VtbWFyeUZvcm1hdFZlcnNpb24iOjIsImlzUm9vdERhdGFTdG9yZSI6ZmFsc2V9",
				encoding: "base64",
				id: "c0e6e1c73bfd42e2a47071489ad8a41a3b62af1c",
				size: 132,
			},
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL21hcCIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMiIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
				size: 160,
			},
			{
				content: "eyJibG9icyI6W10sImNvbnRlbnQiOnt9fQ==",
				encoding: "base64",
				id: "f39311cc21cd0c2ebf40677800a8033b1fd02404",
				size: 36,
			},
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL21hcCIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMiIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
				size: 160,
			},
			{
				content:
					"eyJibG9icyI6W10sImNvbnRlbnQiOnsiY29udGVudCI6eyJ0eXBlIjoiUGxhaW4iLCJ2YWx1ZSI6InRlc3QgbWVzc2FnZSJ9fX0=",
				encoding: "base64",
				id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
				size: 100,
			},
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL21hcCIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMiIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
				size: 160,
			},
			{
				content:
					"eyJibG9icyI6W10sImNvbnRlbnQiOnsiY29udGVudCI6eyJ0eXBlIjoiUGxhaW4iLCJ2YWx1ZSI6InRlc3QgbWVzc2FnZSJ9fX0=",
				encoding: "base64",
				id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
				size: 100,
			},
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL21hcCIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMiIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
				size: 160,
			},
			{
				content:
					"eyJibG9icyI6W10sImNvbnRlbnQiOnsibWVzc2FnZXMiOnsidHlwZSI6IlBsYWluIiwidmFsdWUiOlt7ImlkIjoiZmRiZjllNzUtYzQ4MS00ZGNlLWJmZmMtMDlkZjI3NWZlZjY2IiwiaGFuZGxlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiL3Jvb3RET0lkLzRkNmY0OWEyLTJhZmQtNDRhOC05ZGM2LWYzODI5YTYyNTEyYSJ9LCJzZW5kZXIiOiJ0ZXN0LXVzZXIiLCJ0eXBlIjoicGxhaW4tbGFyZ2UifSx7ImlkIjoiYmU0MzQ3YjktMmE5Zi00Y2M1LWEwZmItNzQyNTA4MTE1YWQyIiwiaGFuZGxlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiL3Jvb3RET0lkL2NhMmI1OTkzLTJkZTItNGM3MC04YWI0LTAzOTUxYWIzMWRmYSJ9LCJzZW5kZXIiOiJ0ZXN0LXVzZXIiLCJ0eXBlIjoicGxhaW4tbGFyZ2UifSx7ImlkIjoiNjEwNDllMWQtMjc2ZC00MGE2LWJhNDUtZWEwYjk4MzMzNDU0IiwiaGFuZGxlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiL3Jvb3RET0lkLzMzZDE5MGM0LWZhNmEtNGQ2ZS1iNjJkLWU2YWQ0NGZhMzgzOSJ9LCJzZW5kZXIiOiJ0ZXN0LXVzZXIiLCJ0eXBlIjoicGxhaW4tbGFyZ2UifSx7ImlkIjoiOWVlYTk1ZTYtNDdiNC00NDIxLWEzZTQtNmNiYzFkMmU5ZjFmIiwic2VuZGVyIjoid2lsbG93eS10YW4tdnVsdHVyZSIsInR5cGUiOiJwbGFpbiIsImNvbnRlbnQiOiJjb21tb2RvIGVpdXNtb2QgY29uc2VxdWF0IGN1cGlkYXRhdCJ9LHsiaWQiOiJiOGI1NzY4MC03OWNlLTQwZDEtYjhkZS02MzEyMjIwZDI5NDAiLCJzZW5kZXIiOiJ3aWxsb3d5LXRhbi12dWx0dXJlIiwidHlwZSI6InBsYWluIiwiY29udGVudCI6IkxhYm9yaXMgZnVnaWF0IExvcmVtIGNvbW1vZG8gZHVpcyBsYWJvcmUgb2ZmaWNpYSBhdXRlIGxhYm9yaXMgcXVpIGlkIGxhYm9yZSBlaXVzbW9kIG51bGxhLiJ9LHsiaWQiOiJhNjM1ZmNiNC03ODQzLTRiNTQtOGU5Yy1lZjFjNTNiZmUxMTIiLCJzZW5kZXIiOiJsaXF1aWQtZW1lcmFsZC1vY2Vsb3QiLCJ0eXBlIjoicGxhaW4iLCJjb250ZW50IjoiQ29uc2VxdWF0IGV4ZXJjaXRhdGlvbiBjaWxsdW0gdXQgaW4gZG9sb3IgY3VwaWRhdGF0IG9jY2FlY2F0IGxhYm9yZSBleGVyY2l0YXRpb24gYWxpcXVhLiJ9XX19fQ==",
				encoding: "base64",
				id: "4f4abeb67158efcf655e8f2e2d72aafa0c834dc4",
				size: 1512,
			},
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL21hcCIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMiIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
				size: 160,
			},
			{
				content:
					"eyJibG9icyI6W10sImNvbnRlbnQiOnsiY29udGVudCI6eyJ0eXBlIjoiUGxhaW4iLCJ2YWx1ZSI6InRlc3QgbWVzc2FnZSJ9fX0=",
				encoding: "base64",
				id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
				size: 100,
			},
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL2RpcmVjdG9yeSIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMSIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "faf720750d1bfe4304b808733b97f7495f6beedc",
				size: 168,
			},
			{
				content:
					"eyJibG9icyI6W10sImNvbnRlbnQiOnsiY2kiOnsiY3NuIjowLCJjY0lkcyI6W119LCJzdWJkaXJlY3RvcmllcyI6eyJpbml0aWFsLW9iamVjdHMta2V5Ijp7ImNpIjp7ImNzbiI6MCwiY2NJZHMiOlsiZGV0YWNoZWQiXX0sInN0b3JhZ2UiOnsibWFwIjp7InR5cGUiOiJQbGFpbiIsInZhbHVlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiL3Jvb3RET0lkLzlmOWE3YzQ0LTUxNmQtNGUxZC04MzZmLTc2YTRjNjBjNDM5ZCJ9fSwiaGlkZGVuRGF0YSI6eyJ0eXBlIjoiUGxhaW4iLCJ2YWx1ZSI6eyJ0eXBlIjoiX19mbHVpZF9oYW5kbGVfXyIsInVybCI6Ii9yb290RE9JZC8xYTE4OGVmNS1jYTE2LTQxNmQtOGNmMS00ZjdiMDhkZmFiNWUifX0sInNpZ25hbGVyIjp7InR5cGUiOiJQbGFpbiIsInZhbHVlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiLzliMTgwNTlkLTQ0OWYtNGQ3YS05YjYwLWVjYmI0ZjJjYjhhYyJ9fX19fX19",
				encoding: "base64",
				id: "9a1f74bd4b0748c2311d3d60866369c769810c26",
				size: 648,
			},
			{
				content:
					"eyJwa2ciOiJbXCJyb290RE9cIl0iLCJzdW1tYXJ5Rm9ybWF0VmVyc2lvbiI6MiwiaXNSb290RGF0YVN0b3JlIjp0cnVlfQ==",
				encoding: "base64",
				id: "c35bbe00f9cb9ee99c8af3d4757411abdda3d8f3",
				size: 96,
			},
			{
				content:
					"eyJlbGVjdGVkQ2xpZW50SWQiOiJjYWFlMTA4ZC1mY2QzLTQwYzEtOTU4MS1hNzNjMzRjNzczODUiLCJlbGVjdGVkUGFyZW50SWQiOiJiY2UxMTU3Yi1iOWQ4LTRkZDYtYjI4NS1mMGJjOTc5NzMyM2IiLCJlbGVjdGlvblNlcXVlbmNlTnVtYmVyIjo1fQ==",
				encoding: "base64",
				id: "8e746e856fe3981ebbf0d9d1fc8b5749bd9ebba3",
				size: 192,
			},
			{
				content:
					"eyJjcmVhdGVDb250YWluZXJSdW50aW1lVmVyc2lvbiI6IjIuMC4wLWludGVybmFsLjcuMS4wIiwiY3JlYXRlQ29udGFpbmVyVGltZXN0YW1wIjoxNzA0MzE2NDE0Njc4LCJzdW1tYXJ5TnVtYmVyIjoyLCJzdW1tYXJ5Rm9ybWF0VmVyc2lvbiI6MSwiZ2NGZWF0dXJlIjozLCJzZXNzaW9uRXhwaXJ5VGltZW91dE1zIjoyNTkyMDAwMDAwLCJzd2VlcEVuYWJsZWQiOmZhbHNlLCJzd2VlcFRpbWVvdXRNcyI6MzExMDQwMDAwMCwibWVzc2FnZSI6eyJjbGllbnRJZCI6bnVsbCwiY2xpZW50U2VxdWVuY2VOdW1iZXIiOi0xLCJtaW5pbXVtU2VxdWVuY2VOdW1iZXIiOjMsInJlZmVyZW5jZVNlcXVlbmNlTnVtYmVyIjotMSwic2VxdWVuY2VOdW1iZXIiOjUsInRpbWVzdGFtcCI6MTcwNDMxNjQyMDMxOCwidHlwZSI6ImpvaW4ifSwidGVsZW1ldHJ5RG9jdW1lbnRJZCI6IjJjNmZkYjM2LTZiNGEtNGNiYS1hZmM0LWNjY2Q1MWUwMThkZCJ9",
				encoding: "base64",
				id: "59f23c5f7089043e5d45b5d013a2b128fc83e77f",
				size: 624,
			},
			{
				content:
					"eyJnY05vZGVzIjp7Ii8iOnsib3V0Ym91bmRSb3V0ZXMiOlsiL3Jvb3RET0lkIl19LCIvOWIxODA1OWQtNDQ5Zi00ZDdhLTliNjAtZWNiYjRmMmNiOGFjIjp7Im91dGJvdW5kUm91dGVzIjpbIi85YjE4MDU5ZC00NDlmLTRkN2EtOWI2MC1lY2JiNGYyY2I4YWMvcm9vdCJdfSwiLzliMTgwNTlkLTQ0OWYtNGQ3YS05YjYwLWVjYmI0ZjJjYjhhYy9yb290Ijp7Im91dGJvdW5kUm91dGVzIjpbIi85YjE4MDU5ZC00NDlmLTRkN2EtOWI2MC1lY2JiNGYyY2I4YWMiXX0sIi9yb290RE9JZCI6eyJvdXRib3VuZFJvdXRlcyI6WyIvcm9vdERPSWQvMWExODhlZjUtY2ExNi00MTZkLThjZjEtNGY3YjA4ZGZhYjVlIiwiL3Jvb3RET0lkLzMzZDE5MGM0LWZhNmEtNGQ2ZS1iNjJkLWU2YWQ0NGZhMzgzOSIsIi9yb290RE9JZC80ZDZmNDlhMi0yYWZkLTQ0YTgtOWRjNi1mMzgyOWE2MjUxMmEiLCIvcm9vdERPSWQvOWY5YTdjNDQtNTE2ZC00ZTFkLTgzNmYtNzZhNGM2MGM0MzlkIiwiL3Jvb3RET0lkL2NhMmI1OTkzLTJkZTItNGM3MC04YWI0LTAzOTUxYWIzMWRmYSIsIi9yb290RE9JZC9yb290Il19LCIvcm9vdERPSWQvMWExODhlZjUtY2ExNi00MTZkLThjZjEtNGY3YjA4ZGZhYjVlIjp7Im91dGJvdW5kUm91dGVzIjpbIi9yb290RE9JZCJdfSwiL3Jvb3RET0lkLzMzZDE5MGM0LWZhNmEtNGQ2ZS1iNjJkLWU2YWQ0NGZhMzgzOSI6eyJvdXRib3VuZFJvdXRlcyI6WyIvcm9vdERPSWQiXX0sIi9yb290RE9JZC80ZDZmNDlhMi0yYWZkLTQ0YTgtOWRjNi1mMzgyOWE2MjUxMmEiOnsib3V0Ym91bmRSb3V0ZXMiOlsiL3Jvb3RET0lkIl19LCIvcm9vdERPSWQvOWY5YTdjNDQtNTE2ZC00ZTFkLTgzNmYtNzZhNGM2MGM0MzlkIjp7Im91dGJvdW5kUm91dGVzIjpbIi9yb290RE9JZCIsIi9yb290RE9JZC8zM2QxOTBjNC1mYTZhLTRkNmUtYjYyZC1lNmFkNDRmYTM4MzkiLCIvcm9vdERPSWQvNGQ2ZjQ5YTItMmFmZC00NGE4LTlkYzYtZjM4MjlhNjI1MTJhIiwiL3Jvb3RET0lkL2NhMmI1OTkzLTJkZTItNGM3MC04YWI0LTAzOTUxYWIzMWRmYSJdfSwiL3Jvb3RET0lkL2NhMmI1OTkzLTJkZTItNGM3MC04YWI0LTAzOTUxYWIzMWRmYSI6eyJvdXRib3VuZFJvdXRlcyI6WyIvcm9vdERPSWQiXX0sIi9yb290RE9JZC9yb290Ijp7Im91dGJvdW5kUm91dGVzIjpbIi85YjE4MDU5ZC00NDlmLTRkN2EtOWI2MC1lY2JiNGYyY2I4YWMiLCIvcm9vdERPSWQiLCIvcm9vdERPSWQvMWExODhlZjUtY2ExNi00MTZkLThjZjEtNGY3YjA4ZGZhYjVlIiwiL3Jvb3RET0lkLzlmOWE3YzQ0LTUxNmQtNGUxZC04MzZmLTc2YTRjNjBjNDM5ZCJdfX19",
				encoding: "base64",
				id: "0c894d75adf93abcc7608cd4fe2ad675160c6126",
				size: 1736,
			},
			{
				content:
					'[{"clientId":"caae108d-fcd3-40c1-9581-a73c34c77385","clientSequenceNumber":1,"contents":"{\\"handle\\":\\"6ec720df3b5bb67de7236d78e96d5e5be0ac2e7f\\",\\"head\\":\\"c88b2573fdd22c6861d5f39bce4f58e61a451a21\\",\\"message\\":\\"Summary @5:3\\",\\"parents\\":[\\"c88b2573fdd22c6861d5f39bce4f58e61a451a21\\"],\\"details\\":{\\"includesProtocolTree\\":false}}","minimumSequenceNumber":5,"referenceSequenceNumber":5,"sequenceNumber":6,"timestamp":1704316450731,"traces":[],"type":"summarize","additionalContent":"{\\"clients\\":[{\\"canEvict\\":true,\\"clientId\\":\\"bce1157b-b9d8-4dd6-b285-f0bc9797323b\\",\\"clientSequenceNumber\\":4,\\"lastUpdate\\":1704316422006,\\"nack\\":false,\\"referenceSequenceNumber\\":5,\\"scopes\\":[\\"doc:read\\",\\"doc:write\\"]},{\\"canEvict\\":true,\\"clientId\\":\\"caae108d-fcd3-40c1-9581-a73c34c77385\\",\\"clientSequenceNumber\\":1,\\"lastUpdate\\":1704316450731,\\"nack\\":false,\\"referenceSequenceNumber\\":5,\\"scopes\\":[\\"doc:read\\",\\"doc:write\\",\\"summary:write\\"]}],\\"durableSequenceNumber\\":0,\\"expHash1\\":\\"4a40d777\\",\\"logOffset\\":51,\\"sequenceNumber\\":6,\\"signalClientConnectionNumber\\":0,\\"lastSentMSN\\":3,\\"nackMessages\\":[],\\"successfullyStartedLambdas\\":[\\"Scribe\\"],\\"checkpointTimestamp\\":1704316450825}","expHash1":"1afb5e42"},{"clientId":null,"clientSequenceNumber":-1,"contents":{"handle":"b3e89845a872e0b656bb41eaa8b162076551762c","summaryProposal":{"summarySequenceNumber":6}},"minimumSequenceNumber":5,"referenceSequenceNumber":-1,"sequenceNumber":7,"timestamp":1704316450967,"traces":[],"type":"summaryAck","data":"{\\"handle\\":\\"b3e89845a872e0b656bb41eaa8b162076551762c\\",\\"summaryProposal\\":{\\"summarySequenceNumber\\":6}}","expHash1":"500bff0e"},{"clientId":null,"clientSequenceNumber":-1,"contents":null,"minimumSequenceNumber":5,"referenceSequenceNumber":-1,"sequenceNumber":8,"timestamp":1704316517302,"traces":[],"type":"leave","data":"\\"caae108d-fcd3-40c1-9581-a73c34c77385\\"","expHash1":"-437260be"},{"clientId":null,"clientSequenceNumber":-1,"contents":null,"minimumSequenceNumber":9,"referenceSequenceNumber":-1,"sequenceNumber":9,"timestamp":1704316517303,"traces":[],"type":"leave","data":"\\"bce1157b-b9d8-4dd6-b285-f0bc9797323b\\"","expHash1":"-2b5c76e3"},{"clientId":null,"clientSequenceNumber":-1,"contents":null,"minimumSequenceNumber":10,"referenceSequenceNumber":10,"sequenceNumber":10,"timestamp":1704316517327,"traces":[],"type":"noClient","additionalContent":"{\\"clients\\":[],\\"durableSequenceNumber\\":6,\\"expHash1\\":\\"-2b5c76e3\\",\\"logOffset\\":58,\\"sequenceNumber\\":10,\\"signalClientConnectionNumber\\":0,\\"lastSentMSN\\":9,\\"nackMessages\\":[],\\"successfullyStartedLambdas\\":[\\"Scribe\\"],\\"checkpointTimestamp\\":1704316517330}","expHash1":"-5b168510"}]',
				encoding: "utf-8",
				id: "ef4cb8e9806ed99d00d431cccefdc1b17d951d9f",
				size: 2670,
			},
			{
				content: "eyJtaW5pbXVtU2VxdWVuY2VOdW1iZXIiOjMsInNlcXVlbmNlTnVtYmVyIjo1fQ==",
				encoding: "base64",
				id: "a29c143075493f2cbe87ad191c0c8b21121cc706",
				size: 64,
			},
			{
				content:
					"W1siYmNlMTE1N2ItYjlkOC00ZGQ2LWIyODUtZjBiYzk3OTczMjNiIix7ImNsaWVudCI6eyJkZXRhaWxzIjp7ImNhcGFiaWxpdGllcyI6eyJpbnRlcmFjdGl2ZSI6dHJ1ZX0sImVudmlyb25tZW50IjoiOyBsb2FkZXJWZXJzaW9uOjIuMC4wLWludGVybmFsLjcuMS4wOyBsb2FkZXJWZXJzaW9uOjIuMC4wLWludGVybmFsLjcuMS4wOyBsb2FkZXJWZXJzaW9uOjIuMC4wLWludGVybmFsLjcuMS4wOyBsb2FkZXJWZXJzaW9uOjIuMC4wLWludGVybmFsLjcuMS4wOyBsb2FkZXJWZXJzaW9uOjIuMC4wLWludGVybmFsLjcuMS4wIn0sInBlcm1pc3Npb24iOltdLCJzY29wZXMiOlsiZG9jOnJlYWQiLCJkb2M6d3JpdGUiXSwidXNlciI6eyJpZCI6IiJ9LCJtb2RlIjoid3JpdGUiLCJ0aW1lc3RhbXAiOjE3MDQzMTY0MTUxNjV9LCJzZXF1ZW5jZU51bWJlciI6MX1dLFsiY2FhZTEwOGQtZmNkMy00MGMxLTk1ODEtYTczYzM0Yzc3Mzg1Iix7ImNsaWVudCI6eyJkZXRhaWxzIjp7ImNhcGFiaWxpdGllcyI6eyJpbnRlcmFjdGl2ZSI6ZmFsc2V9LCJlbnZpcm9ubWVudCI6IjsgbG9hZGVyVmVyc2lvbjoyLjAuMC1pbnRlcm5hbC43LjEuMDsgbG9hZGVyVmVyc2lvbjoyLjAuMC1pbnRlcm5hbC43LjEuMDsgbG9hZGVyVmVyc2lvbjoyLjAuMC1pbnRlcm5hbC43LjEuMDsgbG9hZGVyVmVyc2lvbjoyLjAuMC1pbnRlcm5hbC43LjEuMDsgbG9hZGVyVmVyc2lvbjoyLjAuMC1pbnRlcm5hbC43LjEuMDsgbG9hZGVyVmVyc2lvbjoyLjAuMC1pbnRlcm5hbC43LjEuMDsgbG9hZGVyVmVyc2lvbjoyLjAuMC1pbnRlcm5hbC43LjEuMDsgbG9hZGVyVmVyc2lvbjoyLjAuMC1pbnRlcm5hbC43LjEuMDsgbG9hZGVyVmVyc2lvbjoyLjAuMC1pbnRlcm5hbC43LjEuMCIsInR5cGUiOiJzdW1tYXJpemVyIn0sInBlcm1pc3Npb24iOltdLCJzY29wZXMiOlsiZG9jOnJlYWQiLCJkb2M6d3JpdGUiLCJzdW1tYXJ5OndyaXRlIl0sInVzZXIiOnsiaWQiOiIifSwibW9kZSI6IndyaXRlIiwidGltZXN0YW1wIjoxNzA0MzE2NDIwMzEzfSwic2VxdWVuY2VOdW1iZXIiOjV9XV0=",
				encoding: "base64",
				id: "dc855cffa6220b2e0307ba2a7d40b4a3eae19ace",
				size: 1380,
			},
			{
				content: "W10=",
				encoding: "base64",
				id: "0637a088a01e8ddab3bf3fa98dbe804cbde1a0dc",
				size: 4,
			},
			{
				content:
					"W1siY29kZSIseyJrZXkiOiJjb2RlIiwidmFsdWUiOnsicGFja2FnZSI6Im5vLWR5bmFtaWMtcGFja2FnZSIsImNvbmZpZyI6e319LCJhcHByb3ZhbFNlcXVlbmNlTnVtYmVyIjowLCJjb21taXRTZXF1ZW5jZU51bWJlciI6MCwic2VxdWVuY2VOdW1iZXIiOjB9XV0=",
				encoding: "base64",
				id: "c730f7a6ff8c606cc2b7d083e5a9705bff0d7029",
				size: 200,
			},
			{
				content:
					'{"clients":[],"durableSequenceNumber":6,"expHash1":"-2b5c76e3","logOffset":58,"sequenceNumber":10,"signalClientConnectionNumber":0,"lastSentMSN":9,"nackMessages":[],"successfullyStartedLambdas":["Scribe"],"checkpointTimestamp":1704316517330}',
				encoding: "utf-8",
				id: "bfaeff630a8d2fac4c2efe92a25fb41a2f8f1d1e",
				size: 241,
			},
			{
				content:
					'{"lastSummarySequenceNumber":5,"lastClientSummaryHead":"b3e89845a872e0b656bb41eaa8b162076551762c","logOffset":43,"minimumSequenceNumber":10,"protocolState":{"sequenceNumber":10,"minimumSequenceNumber":10,"members":[],"proposals":[],"values":[["code",{"key":"code","value":{"package":"no-dynamic-package","config":{}},"approvalSequenceNumber":0,"commitSequenceNumber":0,"sequenceNumber":0}]]},"sequenceNumber":10,"isCorrupt":false}',
				encoding: "utf-8",
				id: "38fa24fbaff198c4876aa06a522873f664e2aee7",
				size: 430,
			},
		],
	});

export const ElaborateSecondChannelPayload: IWholeSummaryPayload =
	convertAllUtf8ToBase64<IWholeSummaryPayload>({
		entries: [
			{
				value: {
					type: "tree",
					entries: [
						{
							path: "9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac",
							type: "tree",
							id: "b3e89845a872e0b656bb41eaa8b162076551762c/.app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac",
						},
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													path: "1a188ef5-ca16-416d-8cf1-4f7b08dfab5e",
													type: "tree",
													id: "b3e89845a872e0b656bb41eaa8b162076551762c/.app/.channels/rootDOId/.channels/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e",
												},
												{
													path: "33d190c4-fa6a-4d6e-b62d-e6ad44fa3839",
													type: "tree",
													id: "b3e89845a872e0b656bb41eaa8b162076551762c/.app/.channels/rootDOId/.channels/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839",
												},
												{
													path: "4d6f49a2-2afd-44a8-9dc6-f3829a62512a",
													type: "tree",
													id: "b3e89845a872e0b656bb41eaa8b162076551762c/.app/.channels/rootDOId/.channels/4d6f49a2-2afd-44a8-9dc6-f3829a62512a",
												},
												{
													path: "ca2b5993-2de2-4c70-8ab4-03951ab31dfa",
													type: "tree",
													id: "b3e89845a872e0b656bb41eaa8b162076551762c/.app/.channels/rootDOId/.channels/ca2b5993-2de2-4c70-8ab4-03951ab31dfa",
												},
												{
													path: "root",
													type: "tree",
													id: "b3e89845a872e0b656bb41eaa8b162076551762c/.app/.channels/rootDOId/.channels/root",
												},
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"messages":{"type":"Plain","value":[{"id":"fdbf9e75-c481-4dce-bffc-09df275fef66","handle":{"type":"__fluid_handle__","url":"/rootDOId/4d6f49a2-2afd-44a8-9dc6-f3829a62512a"},"sender":"test-user","type":"plain-large"},{"id":"be4347b9-2a9f-4cc5-a0fb-742508115ad2","handle":{"type":"__fluid_handle__","url":"/rootDOId/ca2b5993-2de2-4c70-8ab4-03951ab31dfa"},"sender":"test-user","type":"plain-large"},{"id":"61049e1d-276d-40a6-ba45-ea0b98333454","handle":{"type":"__fluid_handle__","url":"/rootDOId/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839"},"sender":"test-user","type":"plain-large"},{"id":"9eea95e6-47b4-4421-a3e4-6cbc1d2e9f1f","sender":"willowy-tan-vulture","type":"plain","content":"commodo eiusmod consequat cupidatat"},{"id":"b8b57680-79ce-40d1-b8de-6312220d2940","sender":"willowy-tan-vulture","type":"plain","content":"Laboris fugiat Lorem commodo duis labore officia aute laboris qui id labore eiusmod nulla."},{"id":"a635fcb4-7843-4b54-8e9c-ef1c53bfe112","sender":"liquid-emerald-ocelot","type":"plain","content":"Consequat exercitation cillum ut in dolor cupidatat occaecat labore exercitation aliqua."},{"id":"00abb030-19e9-4dad-a384-53f2719d9a6c","sender":"systematic-moccasin-mockingbird","type":"plain","content":"nisi fugiat excepteur"},{"id":"3a22aa7f-df32-4fa4-86e5-326ed5f672bc","sender":"systematic-moccasin-mockingbird","type":"plain","content":"aute veniam"},{"id":"041285a7-2995-476e-9109-5978369b34d1","sender":"adverse-chocolate-pinniped","type":"plain","content":"Ipsum dolore minim magna minim incididunt Lorem nisi irure consectetur ex."}]}}}',
																	encoding: "utf-8",
																},
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"2.0.0-internal.7.1.0"}',
																	encoding: "utf-8",
																},
																path: ".attributes",
																type: "blob",
															},
														],
													},
													path: "9f9a7c44-516d-4e1d-836f-76a4c60c439d",
													type: "tree",
												},
											],
										},
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\"]","summaryFormatVersion":2,"isRootDataStore":true}',
											encoding: "utf-8",
										},
										path: ".component",
										type: "blob",
									},
								],
							},
							path: "rootDOId",
							type: "tree",
						},
					],
				},
				path: ".channels",
				type: "tree",
			},
			{
				value: {
					type: "blob",
					content:
						'{"createContainerRuntimeVersion":"2.0.0-internal.7.1.0","createContainerTimestamp":1704316414678,"summaryNumber":3,"summaryFormatVersion":1,"gcFeature":3,"sessionExpiryTimeoutMs":2592000000,"sweepEnabled":false,"sweepTimeoutMs":3110400000,"message":{"clientId":null,"clientSequenceNumber":-1,"minimumSequenceNumber":14,"referenceSequenceNumber":-1,"sequenceNumber":16,"timestamp":1704316525393,"type":"join"},"telemetryDocumentId":"2c6fdb36-6b4a-4cba-afc4-cccd51e018dd"}',
					encoding: "utf-8",
				},
				path: ".metadata",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content:
						'{"electedClientId":"33219b04-1021-49fd-9cd3-2dffb250bc37","electedParentId":"88cc08c0-9cf5-45b8-98f8-f970cfbb31e5","electionSequenceNumber":16}',
					encoding: "utf-8",
				},
				path: ".electedSummarizer",
				type: "blob",
			},
			{ path: "gc", type: "tree", id: "b3e89845a872e0b656bb41eaa8b162076551762c/.app/gc" },
		],
		message: "",
		sequenceNumber: 0,
		type: "channel",
	});

export const ElaborateSecondChannelResult: IWriteSummaryResponse = {
	id: "3cf54db08e8ce314776da808750cc92f3664fb03",
};

export const ElaborateSecondContainerPayload: IWholeSummaryPayload =
	convertAllUtf8ToBase64<IWholeSummaryPayload>({
		entries: [
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "blob",
								content:
									'[["88cc08c0-9cf5-45b8-98f8-f970cfbb31e5",{"client":{"details":{"capabilities":{"interactive":true},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0"},"permission":[],"scopes":["doc:read","doc:write"],"user":{"id":""},"mode":"write","timestamp":1704316520196},"sequenceNumber":11}],["33219b04-1021-49fd-9cd3-2dffb250bc37",{"client":{"details":{"capabilities":{"interactive":false},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0","type":"summarizer"},"permission":[],"scopes":["doc:read","doc:write","summary:write"],"user":{"id":""},"mode":"write","timestamp":1704316525385},"sequenceNumber":16}]]',
								encoding: "utf-8",
							},
							path: "quorumMembers",
							type: "blob",
						},
						{
							value: { type: "blob", content: "[]", encoding: "utf-8" },
							path: "quorumProposals",
							type: "blob",
						},
						{
							value: {
								type: "blob",
								content:
									'[["code",{"key":"code","value":{"package":"no-dynamic-package","config":{}},"approvalSequenceNumber":0,"commitSequenceNumber":0,"sequenceNumber":0}]]',
								encoding: "utf-8",
							},
							path: "quorumValues",
							type: "blob",
						},
						{
							value: {
								type: "blob",
								content: '{"minimumSequenceNumber":14,"sequenceNumber":16}',
								encoding: "utf-8",
							},
							path: "attributes",
							type: "blob",
						},
					],
				},
				path: ".protocol",
				type: "tree",
			},
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "blob",
								content:
									'[{"clientId":"33219b04-1021-49fd-9cd3-2dffb250bc37","clientSequenceNumber":1,"contents":"{\\"handle\\":\\"3cf54db08e8ce314776da808750cc92f3664fb03\\",\\"head\\":\\"b3e89845a872e0b656bb41eaa8b162076551762c\\",\\"message\\":\\"Summary @16:14\\",\\"parents\\":[\\"b3e89845a872e0b656bb41eaa8b162076551762c\\"],\\"details\\":{\\"includesProtocolTree\\":false}}","minimumSequenceNumber":14,"referenceSequenceNumber":16,"sequenceNumber":17,"timestamp":1704316554768,"traces":[],"type":"summarize","additionalContent":"{\\"clients\\":[{\\"canEvict\\":true,\\"clientId\\":\\"88cc08c0-9cf5-45b8-98f8-f970cfbb31e5\\",\\"clientSequenceNumber\\":4,\\"lastUpdate\\":1704316523452,\\"nack\\":false,\\"referenceSequenceNumber\\":14,\\"scopes\\":[\\"doc:read\\",\\"doc:write\\"]},{\\"canEvict\\":true,\\"clientId\\":\\"33219b04-1021-49fd-9cd3-2dffb250bc37\\",\\"clientSequenceNumber\\":1,\\"lastUpdate\\":1704316554768,\\"nack\\":false,\\"referenceSequenceNumber\\":16,\\"scopes\\":[\\"doc:read\\",\\"doc:write\\",\\"summary:write\\"]}],\\"durableSequenceNumber\\":10,\\"expHash1\\":\\"5046bbaf\\",\\"logOffset\\":66,\\"sequenceNumber\\":17,\\"signalClientConnectionNumber\\":0,\\"lastSentMSN\\":14,\\"nackMessages\\":[],\\"successfullyStartedLambdas\\":[\\"Scribe\\"],\\"checkpointTimestamp\\":1704316554773}","expHash1":"78a9072a"}]',
								encoding: "utf-8",
							},
							path: "logTail",
							type: "blob",
						},
					],
				},
				path: ".logTail",
				type: "tree",
			},
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "blob",
								content:
									'{"clients":[{"canEvict":true,"clientId":"88cc08c0-9cf5-45b8-98f8-f970cfbb31e5","clientSequenceNumber":4,"lastUpdate":1704316523452,"nack":false,"referenceSequenceNumber":14,"scopes":["doc:read","doc:write"]},{"canEvict":true,"clientId":"33219b04-1021-49fd-9cd3-2dffb250bc37","clientSequenceNumber":1,"lastUpdate":1704316554768,"nack":false,"referenceSequenceNumber":16,"scopes":["doc:read","doc:write","summary:write"]}],"durableSequenceNumber":10,"expHash1":"5046bbaf","logOffset":66,"sequenceNumber":17,"signalClientConnectionNumber":0,"lastSentMSN":14,"nackMessages":[],"successfullyStartedLambdas":["Scribe"],"checkpointTimestamp":1704316554773}',
								encoding: "utf-8",
							},
							path: "deli",
							type: "blob",
						},
						{
							value: {
								type: "blob",
								content:
									'{"lastSummarySequenceNumber":10,"lastClientSummaryHead":"b3e89845a872e0b656bb41eaa8b162076551762c","logOffset":50,"minimumSequenceNumber":14,"protocolState":{"sequenceNumber":16,"minimumSequenceNumber":14,"members":[["88cc08c0-9cf5-45b8-98f8-f970cfbb31e5",{"client":{"details":{"capabilities":{"interactive":true},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0"},"permission":[],"scopes":["doc:read","doc:write"],"user":{"id":""},"mode":"write","timestamp":1704316520196},"sequenceNumber":11}],["33219b04-1021-49fd-9cd3-2dffb250bc37",{"client":{"details":{"capabilities":{"interactive":false},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0","type":"summarizer"},"permission":[],"scopes":["doc:read","doc:write","summary:write"],"user":{"id":""},"mode":"write","timestamp":1704316525385},"sequenceNumber":16}]],"proposals":[],"values":[["code",{"key":"code","value":{"package":"no-dynamic-package","config":{}},"approvalSequenceNumber":0,"commitSequenceNumber":0,"sequenceNumber":0}]]},"sequenceNumber":17,"validParentSummaries":["eaa4ad44d5f727cb007452a61be6ba4ac612ceb8"],"isCorrupt":false}',
								encoding: "utf-8",
							},
							path: "scribe",
							type: "blob",
						},
					],
				},
				path: ".serviceProtocol",
				type: "tree",
			},
			{ path: ".app", type: "tree", id: "3cf54db08e8ce314776da808750cc92f3664fb03" },
		],
		sequenceNumber: 16,
		type: "container",
	});

export const ElaborateSecondContainerResult: IWholeFlatSummary =
	convertAllUtf8ToBase64<IWholeFlatSummary>({
		id: "96e0c76ebe97dd2f4147bfc0613bbeb0cd228604",
		trees: [
			{
				id: "8aafb738b8d0d0a9d9b36f5c6d68d36eaae4aef4",
				entries: [
					{ type: "tree", path: ".app" },
					{ type: "tree", path: ".app/.channels" },
					{
						type: "tree",
						path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac",
					},
					{
						type: "tree",
						path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.channels",
					},
					{
						type: "tree",
						path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.channels/root",
					},
					{
						type: "blob",
						id: "faf720750d1bfe4304b808733b97f7495f6beedc",
						path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.channels/root/.attributes",
					},
					{
						type: "blob",
						id: "a8f0e0d709d42b998767dcc4a82a4e96bec819a2",
						path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.channels/root/header",
					},
					{
						type: "blob",
						id: "c0e6e1c73bfd42e2a47071489ad8a41a3b62af1c",
						path: ".app/.channels/9b18059d-449f-4d7a-9b60-ecbb4f2cb8ac/.component",
					},
					{ type: "tree", path: ".app/.channels/rootDOId" },
					{ type: "tree", path: ".app/.channels/rootDOId/.channels" },
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e/.attributes",
					},
					{
						type: "blob",
						id: "f39311cc21cd0c2ebf40677800a8033b1fd02404",
						path: ".app/.channels/rootDOId/.channels/1a188ef5-ca16-416d-8cf1-4f7b08dfab5e/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839/.attributes",
					},
					{
						type: "blob",
						id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
						path: ".app/.channels/rootDOId/.channels/33d190c4-fa6a-4d6e-b62d-e6ad44fa3839/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/4d6f49a2-2afd-44a8-9dc6-f3829a62512a",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/4d6f49a2-2afd-44a8-9dc6-f3829a62512a/.attributes",
					},
					{
						type: "blob",
						id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
						path: ".app/.channels/rootDOId/.channels/4d6f49a2-2afd-44a8-9dc6-f3829a62512a/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/9f9a7c44-516d-4e1d-836f-76a4c60c439d",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/9f9a7c44-516d-4e1d-836f-76a4c60c439d/.attributes",
					},
					{
						type: "blob",
						id: "f46cb127f54992a236a29ba5f45f9c8c209ae3c6",
						path: ".app/.channels/rootDOId/.channels/9f9a7c44-516d-4e1d-836f-76a4c60c439d/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/ca2b5993-2de2-4c70-8ab4-03951ab31dfa",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/ca2b5993-2de2-4c70-8ab4-03951ab31dfa/.attributes",
					},
					{
						type: "blob",
						id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
						path: ".app/.channels/rootDOId/.channels/ca2b5993-2de2-4c70-8ab4-03951ab31dfa/header",
					},
					{ type: "tree", path: ".app/.channels/rootDOId/.channels/root" },
					{
						type: "blob",
						id: "faf720750d1bfe4304b808733b97f7495f6beedc",
						path: ".app/.channels/rootDOId/.channels/root/.attributes",
					},
					{
						type: "blob",
						id: "9a1f74bd4b0748c2311d3d60866369c769810c26",
						path: ".app/.channels/rootDOId/.channels/root/header",
					},
					{
						type: "blob",
						id: "c35bbe00f9cb9ee99c8af3d4757411abdda3d8f3",
						path: ".app/.channels/rootDOId/.component",
					},
					{
						type: "blob",
						id: "c1cf05f4e518239058d145ba79b8db3c966453c2",
						path: ".app/.electedSummarizer",
					},
					{
						type: "blob",
						id: "bac8da9af800e40b52b0da7cbbd6eb08647d5e6a",
						path: ".app/.metadata",
					},
					{ type: "tree", path: ".app/gc" },
					{
						type: "blob",
						id: "0c894d75adf93abcc7608cd4fe2ad675160c6126",
						path: ".app/gc/__gc_root",
					},
					{ type: "tree", path: ".logTail" },
					{
						type: "blob",
						id: "f3438e36ac38b13dc5e0ee9f1f1268af4186cfb0",
						path: ".logTail/logTail",
					},
					{ type: "tree", path: ".protocol" },
					{
						type: "blob",
						id: "cd74ef74a8259d3b9f66eae6783e21258bcc0baa",
						path: ".protocol/attributes",
					},
					{
						type: "blob",
						id: "eeaa3708744311d07a05ad866d4402509d9b11a1",
						path: ".protocol/quorumMembers",
					},
					{
						type: "blob",
						id: "0637a088a01e8ddab3bf3fa98dbe804cbde1a0dc",
						path: ".protocol/quorumProposals",
					},
					{
						type: "blob",
						id: "c730f7a6ff8c606cc2b7d083e5a9705bff0d7029",
						path: ".protocol/quorumValues",
					},
					{ type: "tree", path: ".serviceProtocol" },
					{
						type: "blob",
						id: "101fb34ba27de6e1c80d4c0fe6c2b6c5cfe43fe1",
						path: ".serviceProtocol/deli",
					},
					{
						type: "blob",
						id: "29958a8b0eabc671ab184fc4e3ce55a327b72a15",
						path: ".serviceProtocol/scribe",
					},
				],
			},
		],
		blobs: [
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL2RpcmVjdG9yeSIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMSIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "faf720750d1bfe4304b808733b97f7495f6beedc",
				size: 168,
			},
			{
				content: "eyJibG9icyI6W10sImNvbnRlbnQiOnsiY2kiOnsiY3NuIjowLCJjY0lkcyI6W119fX0=",
				encoding: "base64",
				id: "a8f0e0d709d42b998767dcc4a82a4e96bec819a2",
				size: 68,
			},
			{
				content:
					"eyJwa2ciOiJbXCJyb290RE9cIixcIkBmbHVpZC1leGFtcGxlL3NpZ25hbGVyXCJdIiwic3VtbWFyeUZvcm1hdFZlcnNpb24iOjIsImlzUm9vdERhdGFTdG9yZSI6ZmFsc2V9",
				encoding: "base64",
				id: "c0e6e1c73bfd42e2a47071489ad8a41a3b62af1c",
				size: 132,
			},
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL21hcCIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMiIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
				size: 160,
			},
			{
				content: "eyJibG9icyI6W10sImNvbnRlbnQiOnt9fQ==",
				encoding: "base64",
				id: "f39311cc21cd0c2ebf40677800a8033b1fd02404",
				size: 36,
			},
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL21hcCIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMiIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
				size: 160,
			},
			{
				content:
					"eyJibG9icyI6W10sImNvbnRlbnQiOnsiY29udGVudCI6eyJ0eXBlIjoiUGxhaW4iLCJ2YWx1ZSI6InRlc3QgbWVzc2FnZSJ9fX0=",
				encoding: "base64",
				id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
				size: 100,
			},
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL21hcCIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMiIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
				size: 160,
			},
			{
				content:
					"eyJibG9icyI6W10sImNvbnRlbnQiOnsiY29udGVudCI6eyJ0eXBlIjoiUGxhaW4iLCJ2YWx1ZSI6InRlc3QgbWVzc2FnZSJ9fX0=",
				encoding: "base64",
				id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
				size: 100,
			},
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL21hcCIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMiIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
				size: 160,
			},
			{
				content:
					"eyJibG9icyI6W10sImNvbnRlbnQiOnsibWVzc2FnZXMiOnsidHlwZSI6IlBsYWluIiwidmFsdWUiOlt7ImlkIjoiZmRiZjllNzUtYzQ4MS00ZGNlLWJmZmMtMDlkZjI3NWZlZjY2IiwiaGFuZGxlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiL3Jvb3RET0lkLzRkNmY0OWEyLTJhZmQtNDRhOC05ZGM2LWYzODI5YTYyNTEyYSJ9LCJzZW5kZXIiOiJ0ZXN0LXVzZXIiLCJ0eXBlIjoicGxhaW4tbGFyZ2UifSx7ImlkIjoiYmU0MzQ3YjktMmE5Zi00Y2M1LWEwZmItNzQyNTA4MTE1YWQyIiwiaGFuZGxlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiL3Jvb3RET0lkL2NhMmI1OTkzLTJkZTItNGM3MC04YWI0LTAzOTUxYWIzMWRmYSJ9LCJzZW5kZXIiOiJ0ZXN0LXVzZXIiLCJ0eXBlIjoicGxhaW4tbGFyZ2UifSx7ImlkIjoiNjEwNDllMWQtMjc2ZC00MGE2LWJhNDUtZWEwYjk4MzMzNDU0IiwiaGFuZGxlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiL3Jvb3RET0lkLzMzZDE5MGM0LWZhNmEtNGQ2ZS1iNjJkLWU2YWQ0NGZhMzgzOSJ9LCJzZW5kZXIiOiJ0ZXN0LXVzZXIiLCJ0eXBlIjoicGxhaW4tbGFyZ2UifSx7ImlkIjoiOWVlYTk1ZTYtNDdiNC00NDIxLWEzZTQtNmNiYzFkMmU5ZjFmIiwic2VuZGVyIjoid2lsbG93eS10YW4tdnVsdHVyZSIsInR5cGUiOiJwbGFpbiIsImNvbnRlbnQiOiJjb21tb2RvIGVpdXNtb2QgY29uc2VxdWF0IGN1cGlkYXRhdCJ9LHsiaWQiOiJiOGI1NzY4MC03OWNlLTQwZDEtYjhkZS02MzEyMjIwZDI5NDAiLCJzZW5kZXIiOiJ3aWxsb3d5LXRhbi12dWx0dXJlIiwidHlwZSI6InBsYWluIiwiY29udGVudCI6IkxhYm9yaXMgZnVnaWF0IExvcmVtIGNvbW1vZG8gZHVpcyBsYWJvcmUgb2ZmaWNpYSBhdXRlIGxhYm9yaXMgcXVpIGlkIGxhYm9yZSBlaXVzbW9kIG51bGxhLiJ9LHsiaWQiOiJhNjM1ZmNiNC03ODQzLTRiNTQtOGU5Yy1lZjFjNTNiZmUxMTIiLCJzZW5kZXIiOiJsaXF1aWQtZW1lcmFsZC1vY2Vsb3QiLCJ0eXBlIjoicGxhaW4iLCJjb250ZW50IjoiQ29uc2VxdWF0IGV4ZXJjaXRhdGlvbiBjaWxsdW0gdXQgaW4gZG9sb3IgY3VwaWRhdGF0IG9jY2FlY2F0IGxhYm9yZSBleGVyY2l0YXRpb24gYWxpcXVhLiJ9LHsiaWQiOiIwMGFiYjAzMC0xOWU5LTRkYWQtYTM4NC01M2YyNzE5ZDlhNmMiLCJzZW5kZXIiOiJzeXN0ZW1hdGljLW1vY2Nhc2luLW1vY2tpbmdiaXJkIiwidHlwZSI6InBsYWluIiwiY29udGVudCI6Im5pc2kgZnVnaWF0IGV4Y2VwdGV1ciJ9LHsiaWQiOiIzYTIyYWE3Zi1kZjMyLTRmYTQtODZlNS0zMjZlZDVmNjcyYmMiLCJzZW5kZXIiOiJzeXN0ZW1hdGljLW1vY2Nhc2luLW1vY2tpbmdiaXJkIiwidHlwZSI6InBsYWluIiwiY29udGVudCI6ImF1dGUgdmVuaWFtIn0seyJpZCI6IjA0MTI4NWE3LTI5OTUtNDc2ZS05MTA5LTU5NzgzNjliMzRkMSIsInNlbmRlciI6ImFkdmVyc2UtY2hvY29sYXRlLXBpbm5pcGVkIiwidHlwZSI6InBsYWluIiwiY29udGVudCI6Iklwc3VtIGRvbG9yZSBtaW5pbSBtYWduYSBtaW5pbSBpbmNpZGlkdW50IExvcmVtIG5pc2kgaXJ1cmUgY29uc2VjdGV0dXIgZXguIn1dfX19",
				encoding: "base64",
				id: "f46cb127f54992a236a29ba5f45f9c8c209ae3c6",
				size: 2112,
			},
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL21hcCIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMiIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
				size: 160,
			},
			{
				content:
					"eyJibG9icyI6W10sImNvbnRlbnQiOnsiY29udGVudCI6eyJ0eXBlIjoiUGxhaW4iLCJ2YWx1ZSI6InRlc3QgbWVzc2FnZSJ9fX0=",
				encoding: "base64",
				id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
				size: 100,
			},
			{
				content:
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL2RpcmVjdG9yeSIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMSIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "faf720750d1bfe4304b808733b97f7495f6beedc",
				size: 168,
			},
			{
				content:
					"eyJibG9icyI6W10sImNvbnRlbnQiOnsiY2kiOnsiY3NuIjowLCJjY0lkcyI6W119LCJzdWJkaXJlY3RvcmllcyI6eyJpbml0aWFsLW9iamVjdHMta2V5Ijp7ImNpIjp7ImNzbiI6MCwiY2NJZHMiOlsiZGV0YWNoZWQiXX0sInN0b3JhZ2UiOnsibWFwIjp7InR5cGUiOiJQbGFpbiIsInZhbHVlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiL3Jvb3RET0lkLzlmOWE3YzQ0LTUxNmQtNGUxZC04MzZmLTc2YTRjNjBjNDM5ZCJ9fSwiaGlkZGVuRGF0YSI6eyJ0eXBlIjoiUGxhaW4iLCJ2YWx1ZSI6eyJ0eXBlIjoiX19mbHVpZF9oYW5kbGVfXyIsInVybCI6Ii9yb290RE9JZC8xYTE4OGVmNS1jYTE2LTQxNmQtOGNmMS00ZjdiMDhkZmFiNWUifX0sInNpZ25hbGVyIjp7InR5cGUiOiJQbGFpbiIsInZhbHVlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiLzliMTgwNTlkLTQ0OWYtNGQ3YS05YjYwLWVjYmI0ZjJjYjhhYyJ9fX19fX19",
				encoding: "base64",
				id: "9a1f74bd4b0748c2311d3d60866369c769810c26",
				size: 648,
			},
			{
				content:
					"eyJwa2ciOiJbXCJyb290RE9cIl0iLCJzdW1tYXJ5Rm9ybWF0VmVyc2lvbiI6MiwiaXNSb290RGF0YVN0b3JlIjp0cnVlfQ==",
				encoding: "base64",
				id: "c35bbe00f9cb9ee99c8af3d4757411abdda3d8f3",
				size: 96,
			},
			{
				content:
					"eyJlbGVjdGVkQ2xpZW50SWQiOiIzMzIxOWIwNC0xMDIxLTQ5ZmQtOWNkMy0yZGZmYjI1MGJjMzciLCJlbGVjdGVkUGFyZW50SWQiOiI4OGNjMDhjMC05Y2Y1LTQ1YjgtOThmOC1mOTcwY2ZiYjMxZTUiLCJlbGVjdGlvblNlcXVlbmNlTnVtYmVyIjoxNn0=",
				encoding: "base64",
				id: "c1cf05f4e518239058d145ba79b8db3c966453c2",
				size: 192,
			},
			{
				content:
					"eyJjcmVhdGVDb250YWluZXJSdW50aW1lVmVyc2lvbiI6IjIuMC4wLWludGVybmFsLjcuMS4wIiwiY3JlYXRlQ29udGFpbmVyVGltZXN0YW1wIjoxNzA0MzE2NDE0Njc4LCJzdW1tYXJ5TnVtYmVyIjozLCJzdW1tYXJ5Rm9ybWF0VmVyc2lvbiI6MSwiZ2NGZWF0dXJlIjozLCJzZXNzaW9uRXhwaXJ5VGltZW91dE1zIjoyNTkyMDAwMDAwLCJzd2VlcEVuYWJsZWQiOmZhbHNlLCJzd2VlcFRpbWVvdXRNcyI6MzExMDQwMDAwMCwibWVzc2FnZSI6eyJjbGllbnRJZCI6bnVsbCwiY2xpZW50U2VxdWVuY2VOdW1iZXIiOi0xLCJtaW5pbXVtU2VxdWVuY2VOdW1iZXIiOjE0LCJyZWZlcmVuY2VTZXF1ZW5jZU51bWJlciI6LTEsInNlcXVlbmNlTnVtYmVyIjoxNiwidGltZXN0YW1wIjoxNzA0MzE2NTI1MzkzLCJ0eXBlIjoiam9pbiJ9LCJ0ZWxlbWV0cnlEb2N1bWVudElkIjoiMmM2ZmRiMzYtNmI0YS00Y2JhLWFmYzQtY2NjZDUxZTAxOGRkIn0=",
				encoding: "base64",
				id: "bac8da9af800e40b52b0da7cbbd6eb08647d5e6a",
				size: 628,
			},
			{
				content:
					"eyJnY05vZGVzIjp7Ii8iOnsib3V0Ym91bmRSb3V0ZXMiOlsiL3Jvb3RET0lkIl19LCIvOWIxODA1OWQtNDQ5Zi00ZDdhLTliNjAtZWNiYjRmMmNiOGFjIjp7Im91dGJvdW5kUm91dGVzIjpbIi85YjE4MDU5ZC00NDlmLTRkN2EtOWI2MC1lY2JiNGYyY2I4YWMvcm9vdCJdfSwiLzliMTgwNTlkLTQ0OWYtNGQ3YS05YjYwLWVjYmI0ZjJjYjhhYy9yb290Ijp7Im91dGJvdW5kUm91dGVzIjpbIi85YjE4MDU5ZC00NDlmLTRkN2EtOWI2MC1lY2JiNGYyY2I4YWMiXX0sIi9yb290RE9JZCI6eyJvdXRib3VuZFJvdXRlcyI6WyIvcm9vdERPSWQvMWExODhlZjUtY2ExNi00MTZkLThjZjEtNGY3YjA4ZGZhYjVlIiwiL3Jvb3RET0lkLzMzZDE5MGM0LWZhNmEtNGQ2ZS1iNjJkLWU2YWQ0NGZhMzgzOSIsIi9yb290RE9JZC80ZDZmNDlhMi0yYWZkLTQ0YTgtOWRjNi1mMzgyOWE2MjUxMmEiLCIvcm9vdERPSWQvOWY5YTdjNDQtNTE2ZC00ZTFkLTgzNmYtNzZhNGM2MGM0MzlkIiwiL3Jvb3RET0lkL2NhMmI1OTkzLTJkZTItNGM3MC04YWI0LTAzOTUxYWIzMWRmYSIsIi9yb290RE9JZC9yb290Il19LCIvcm9vdERPSWQvMWExODhlZjUtY2ExNi00MTZkLThjZjEtNGY3YjA4ZGZhYjVlIjp7Im91dGJvdW5kUm91dGVzIjpbIi9yb290RE9JZCJdfSwiL3Jvb3RET0lkLzMzZDE5MGM0LWZhNmEtNGQ2ZS1iNjJkLWU2YWQ0NGZhMzgzOSI6eyJvdXRib3VuZFJvdXRlcyI6WyIvcm9vdERPSWQiXX0sIi9yb290RE9JZC80ZDZmNDlhMi0yYWZkLTQ0YTgtOWRjNi1mMzgyOWE2MjUxMmEiOnsib3V0Ym91bmRSb3V0ZXMiOlsiL3Jvb3RET0lkIl19LCIvcm9vdERPSWQvOWY5YTdjNDQtNTE2ZC00ZTFkLTgzNmYtNzZhNGM2MGM0MzlkIjp7Im91dGJvdW5kUm91dGVzIjpbIi9yb290RE9JZCIsIi9yb290RE9JZC8zM2QxOTBjNC1mYTZhLTRkNmUtYjYyZC1lNmFkNDRmYTM4MzkiLCIvcm9vdERPSWQvNGQ2ZjQ5YTItMmFmZC00NGE4LTlkYzYtZjM4MjlhNjI1MTJhIiwiL3Jvb3RET0lkL2NhMmI1OTkzLTJkZTItNGM3MC04YWI0LTAzOTUxYWIzMWRmYSJdfSwiL3Jvb3RET0lkL2NhMmI1OTkzLTJkZTItNGM3MC04YWI0LTAzOTUxYWIzMWRmYSI6eyJvdXRib3VuZFJvdXRlcyI6WyIvcm9vdERPSWQiXX0sIi9yb290RE9JZC9yb290Ijp7Im91dGJvdW5kUm91dGVzIjpbIi85YjE4MDU5ZC00NDlmLTRkN2EtOWI2MC1lY2JiNGYyY2I4YWMiLCIvcm9vdERPSWQiLCIvcm9vdERPSWQvMWExODhlZjUtY2ExNi00MTZkLThjZjEtNGY3YjA4ZGZhYjVlIiwiL3Jvb3RET0lkLzlmOWE3YzQ0LTUxNmQtNGUxZC04MzZmLTc2YTRjNjBjNDM5ZCJdfX19",
				encoding: "base64",
				id: "0c894d75adf93abcc7608cd4fe2ad675160c6126",
				size: 1736,
			},
			{
				content:
					'[{"clientId":"33219b04-1021-49fd-9cd3-2dffb250bc37","clientSequenceNumber":1,"contents":"{\\"handle\\":\\"3cf54db08e8ce314776da808750cc92f3664fb03\\",\\"head\\":\\"b3e89845a872e0b656bb41eaa8b162076551762c\\",\\"message\\":\\"Summary @16:14\\",\\"parents\\":[\\"b3e89845a872e0b656bb41eaa8b162076551762c\\"],\\"details\\":{\\"includesProtocolTree\\":false}}","minimumSequenceNumber":14,"referenceSequenceNumber":16,"sequenceNumber":17,"timestamp":1704316554768,"traces":[],"type":"summarize","additionalContent":"{\\"clients\\":[{\\"canEvict\\":true,\\"clientId\\":\\"88cc08c0-9cf5-45b8-98f8-f970cfbb31e5\\",\\"clientSequenceNumber\\":4,\\"lastUpdate\\":1704316523452,\\"nack\\":false,\\"referenceSequenceNumber\\":14,\\"scopes\\":[\\"doc:read\\",\\"doc:write\\"]},{\\"canEvict\\":true,\\"clientId\\":\\"33219b04-1021-49fd-9cd3-2dffb250bc37\\",\\"clientSequenceNumber\\":1,\\"lastUpdate\\":1704316554768,\\"nack\\":false,\\"referenceSequenceNumber\\":16,\\"scopes\\":[\\"doc:read\\",\\"doc:write\\",\\"summary:write\\"]}],\\"durableSequenceNumber\\":10,\\"expHash1\\":\\"5046bbaf\\",\\"logOffset\\":66,\\"sequenceNumber\\":17,\\"signalClientConnectionNumber\\":0,\\"lastSentMSN\\":14,\\"nackMessages\\":[],\\"successfullyStartedLambdas\\":[\\"Scribe\\"],\\"checkpointTimestamp\\":1704316554773}","expHash1":"78a9072a"}]',
				encoding: "utf-8",
				id: "f3438e36ac38b13dc5e0ee9f1f1268af4186cfb0",
				size: 1231,
			},
			{
				content: '{"minimumSequenceNumber":14,"sequenceNumber":16}',
				encoding: "utf-8",
				id: "cd74ef74a8259d3b9f66eae6783e21258bcc0baa",
				size: 48,
			},
			{
				content:
					'[["88cc08c0-9cf5-45b8-98f8-f970cfbb31e5",{"client":{"details":{"capabilities":{"interactive":true},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0"},"permission":[],"scopes":["doc:read","doc:write"],"user":{"id":""},"mode":"write","timestamp":1704316520196},"sequenceNumber":11}],["33219b04-1021-49fd-9cd3-2dffb250bc37",{"client":{"details":{"capabilities":{"interactive":false},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0","type":"summarizer"},"permission":[],"scopes":["doc:read","doc:write","summary:write"],"user":{"id":""},"mode":"write","timestamp":1704316525385},"sequenceNumber":16}]]',
				encoding: "utf-8",
				id: "eeaa3708744311d07a05ad866d4402509d9b11a1",
				size: 1036,
			},
			{
				content: "[]",
				encoding: "utf-8",
				id: "0637a088a01e8ddab3bf3fa98dbe804cbde1a0dc",
				size: 2,
			},
			{
				content:
					'[["code",{"key":"code","value":{"package":"no-dynamic-package","config":{}},"approvalSequenceNumber":0,"commitSequenceNumber":0,"sequenceNumber":0}]]',
				encoding: "utf-8",
				id: "c730f7a6ff8c606cc2b7d083e5a9705bff0d7029",
				size: 149,
			},
			{
				content:
					'{"clients":[{"canEvict":true,"clientId":"88cc08c0-9cf5-45b8-98f8-f970cfbb31e5","clientSequenceNumber":4,"lastUpdate":1704316523452,"nack":false,"referenceSequenceNumber":14,"scopes":["doc:read","doc:write"]},{"canEvict":true,"clientId":"33219b04-1021-49fd-9cd3-2dffb250bc37","clientSequenceNumber":1,"lastUpdate":1704316554768,"nack":false,"referenceSequenceNumber":16,"scopes":["doc:read","doc:write","summary:write"]}],"durableSequenceNumber":10,"expHash1":"5046bbaf","logOffset":66,"sequenceNumber":17,"signalClientConnectionNumber":0,"lastSentMSN":14,"nackMessages":[],"successfullyStartedLambdas":["Scribe"],"checkpointTimestamp":1704316554773}',
				encoding: "utf-8",
				id: "101fb34ba27de6e1c80d4c0fe6c2b6c5cfe43fe1",
				size: 649,
			},
			{
				content:
					'{"lastSummarySequenceNumber":10,"lastClientSummaryHead":"b3e89845a872e0b656bb41eaa8b162076551762c","logOffset":50,"minimumSequenceNumber":14,"protocolState":{"sequenceNumber":16,"minimumSequenceNumber":14,"members":[["88cc08c0-9cf5-45b8-98f8-f970cfbb31e5",{"client":{"details":{"capabilities":{"interactive":true},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0"},"permission":[],"scopes":["doc:read","doc:write"],"user":{"id":""},"mode":"write","timestamp":1704316520196},"sequenceNumber":11}],["33219b04-1021-49fd-9cd3-2dffb250bc37",{"client":{"details":{"capabilities":{"interactive":false},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0","type":"summarizer"},"permission":[],"scopes":["doc:read","doc:write","summary:write"],"user":{"id":""},"mode":"write","timestamp":1704316525385},"sequenceNumber":16}]],"proposals":[],"values":[["code",{"key":"code","value":{"package":"no-dynamic-package","config":{}},"approvalSequenceNumber":0,"commitSequenceNumber":0,"sequenceNumber":0}]]},"sequenceNumber":17,"validParentSummaries":["eaa4ad44d5f727cb007452a61be6ba4ac612ceb8"],"isCorrupt":false}',
				encoding: "utf-8",
				id: "29958a8b0eabc671ab184fc4e3ce55a327b72a15",
				size: 1533,
			},
		],
	});

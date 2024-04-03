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
 */

export const sampleInitialSummaryUpload: IWholeSummaryPayload =
	convertAllUtf8ToBase64<IWholeSummaryPayload>({
		message: "Initial Container Summary",
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
																					'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"subdirectories":{"initial-objects-key":{"ci":{"csn":0,"ccIds":["detached"]},"storage":{"map":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/rootDOId/ab9706dc-ef6a-46c5-b728-6d1353cfe12b"}},"hiddenData":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/rootDOId/b0ed55c3-e5f6-41c5-bbbb-1f653a186e94"}},"signaler":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/3a562a77-a987-4069-a7e6-7f6248e3670e"}}}}}}}',
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
																					'{"blobs":[],"content":{"messages":{"type":"Plain","value":[{"id":"ba7cf17f-64cc-48d0-abb8-93d82b1c350e","handle":{"type":"__fluid_handle__","url":"/rootDOId/6c9a0944-cdc3-4877-89f1-2b514cc06940"},"sender":"test-user","type":"plain-large"},{"id":"e3e6e8cc-d403-49af-9e34-5b63bc62aff4","handle":{"type":"__fluid_handle__","url":"/rootDOId/59c55e26-781f-40de-a219-31dec25332aa"},"sender":"test-user","type":"plain-large"},{"id":"6729545b-5a50-4fb8-9229-eee097f0b772","handle":{"type":"__fluid_handle__","url":"/rootDOId/ca0e9520-c0eb-452d-848c-846da2405ee8"},"sender":"test-user","type":"plain-large"}]}}}',
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
																path: "ab9706dc-ef6a-46c5-b728-6d1353cfe12b",
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
																path: "b0ed55c3-e5f6-41c5-bbbb-1f653a186e94",
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
																path: "6c9a0944-cdc3-4877-89f1-2b514cc06940",
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
																path: "59c55e26-781f-40de-a219-31dec25332aa",
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
																path: "ca0e9520-c0eb-452d-848c-846da2405ee8",
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
										path: "3a562a77-a987-4069-a7e6-7f6248e3670e",
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
									'{"createContainerRuntimeVersion":"2.0.0-internal.7.1.0","createContainerTimestamp":1702330704065,"summaryNumber":1,"summaryFormatVersion":1,"gcFeature":3,"sessionExpiryTimeoutMs":2592000000,"sweepEnabled":false,"sweepTimeoutMs":3110400000,"telemetryDocumentId":"f71135ac-e201-4449-a580-234ba94e0af7"}',
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
export const sampleInitialSummaryResponse: IWholeFlatSummary =
	convertAllUtf8ToBase64<IWholeFlatSummary>({
		// This is a Commit ID and will vary with each run, because commits are calculated with timestamps.
		id: "f79125fb1911b4c7e142e8ad539458d2f288e155",
		trees: [
			{
				id: "120239b2e0c608274b1ec792e31c210186965d8d",
				entries: [
					{ type: "tree", path: ".app" },
					{ type: "tree", path: ".app/.channels" },
					{ type: "tree", path: ".app/.channels/3a562a77-a987-4069-a7e6-7f6248e3670e" },
					{
						type: "tree",
						path: ".app/.channels/3a562a77-a987-4069-a7e6-7f6248e3670e/.channels",
					},
					{
						type: "tree",
						path: ".app/.channels/3a562a77-a987-4069-a7e6-7f6248e3670e/.channels/root",
					},
					{
						type: "blob",
						id: "faf720750d1bfe4304b808733b97f7495f6beedc",
						path: ".app/.channels/3a562a77-a987-4069-a7e6-7f6248e3670e/.channels/root/.attributes",
					},
					{
						type: "blob",
						id: "a8f0e0d709d42b998767dcc4a82a4e96bec819a2",
						path: ".app/.channels/3a562a77-a987-4069-a7e6-7f6248e3670e/.channels/root/header",
					},
					{
						type: "blob",
						id: "c0e6e1c73bfd42e2a47071489ad8a41a3b62af1c",
						path: ".app/.channels/3a562a77-a987-4069-a7e6-7f6248e3670e/.component",
					},
					{ type: "tree", path: ".app/.channels/rootDOId" },
					{ type: "tree", path: ".app/.channels/rootDOId/.channels" },
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/59c55e26-781f-40de-a219-31dec25332aa",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/59c55e26-781f-40de-a219-31dec25332aa/.attributes",
					},
					{
						type: "blob",
						id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
						path: ".app/.channels/rootDOId/.channels/59c55e26-781f-40de-a219-31dec25332aa/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/6c9a0944-cdc3-4877-89f1-2b514cc06940",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/6c9a0944-cdc3-4877-89f1-2b514cc06940/.attributes",
					},
					{
						type: "blob",
						id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
						path: ".app/.channels/rootDOId/.channels/6c9a0944-cdc3-4877-89f1-2b514cc06940/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/ab9706dc-ef6a-46c5-b728-6d1353cfe12b",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/ab9706dc-ef6a-46c5-b728-6d1353cfe12b/.attributes",
					},
					{
						type: "blob",
						id: "131a0ca80a1497425c09aa80ed86c632e503d066",
						path: ".app/.channels/rootDOId/.channels/ab9706dc-ef6a-46c5-b728-6d1353cfe12b/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/b0ed55c3-e5f6-41c5-bbbb-1f653a186e94",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/b0ed55c3-e5f6-41c5-bbbb-1f653a186e94/.attributes",
					},
					{
						type: "blob",
						id: "f39311cc21cd0c2ebf40677800a8033b1fd02404",
						path: ".app/.channels/rootDOId/.channels/b0ed55c3-e5f6-41c5-bbbb-1f653a186e94/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/ca0e9520-c0eb-452d-848c-846da2405ee8",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/ca0e9520-c0eb-452d-848c-846da2405ee8/.attributes",
					},
					{
						type: "blob",
						id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
						path: ".app/.channels/rootDOId/.channels/ca0e9520-c0eb-452d-848c-846da2405ee8/header",
					},
					{ type: "tree", path: ".app/.channels/rootDOId/.channels/root" },
					{
						type: "blob",
						id: "faf720750d1bfe4304b808733b97f7495f6beedc",
						path: ".app/.channels/rootDOId/.channels/root/.attributes",
					},
					{
						type: "blob",
						id: "0564506cbb1091f7c2086a661db2571c4a4c194b",
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
						id: "d846ce370ebb18c051776bd8959f491197100d24",
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
				sequenceNumber: undefined,
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
				content:
					'{"blobs":[],"content":{"content":{"type":"Plain","value":"test message"}}}',
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
					'{"blobs":[],"content":{"content":{"type":"Plain","value":"test message"}}}',
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
					'{"blobs":[],"content":{"messages":{"type":"Plain","value":[{"id":"ba7cf17f-64cc-48d0-abb8-93d82b1c350e","handle":{"type":"__fluid_handle__","url":"/rootDOId/6c9a0944-cdc3-4877-89f1-2b514cc06940"},"sender":"test-user","type":"plain-large"},{"id":"e3e6e8cc-d403-49af-9e34-5b63bc62aff4","handle":{"type":"__fluid_handle__","url":"/rootDOId/59c55e26-781f-40de-a219-31dec25332aa"},"sender":"test-user","type":"plain-large"},{"id":"6729545b-5a50-4fb8-9229-eee097f0b772","handle":{"type":"__fluid_handle__","url":"/rootDOId/ca0e9520-c0eb-452d-848c-846da2405ee8"},"sender":"test-user","type":"plain-large"}]}}}',
				encoding: "utf-8",
				id: "131a0ca80a1497425c09aa80ed86c632e503d066",
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
				content:
					'{"blobs":[],"content":{"content":{"type":"Plain","value":"test message"}}}',
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
					'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"subdirectories":{"initial-objects-key":{"ci":{"csn":0,"ccIds":["detached"]},"storage":{"map":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/rootDOId/ab9706dc-ef6a-46c5-b728-6d1353cfe12b"}},"hiddenData":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/rootDOId/b0ed55c3-e5f6-41c5-bbbb-1f653a186e94"}},"signaler":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/3a562a77-a987-4069-a7e6-7f6248e3670e"}}}}}}}',
				encoding: "utf-8",
				id: "0564506cbb1091f7c2086a661db2571c4a4c194b",
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
					'{"createContainerRuntimeVersion":"2.0.0-internal.7.1.0","createContainerTimestamp":1702330704065,"summaryNumber":1,"summaryFormatVersion":1,"gcFeature":3,"sessionExpiryTimeoutMs":2592000000,"sweepEnabled":false,"sweepTimeoutMs":3110400000,"telemetryDocumentId":"f71135ac-e201-4449-a580-234ba94e0af7"}',
				encoding: "utf-8",
				id: "d846ce370ebb18c051776bd8959f491197100d24",
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

export const sampleChannelSummaryUpload: IWholeSummaryPayload =
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
							path: "3a562a77-a987-4069-a7e6-7f6248e3670e",
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
													path: "59c55e26-781f-40de-a219-31dec25332aa",
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
													path: "6c9a0944-cdc3-4877-89f1-2b514cc06940",
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
																		'{"blobs":[],"content":{"messages":{"type":"Plain","value":[{"id":"ba7cf17f-64cc-48d0-abb8-93d82b1c350e","handle":{"type":"__fluid_handle__","url":"/rootDOId/6c9a0944-cdc3-4877-89f1-2b514cc06940"},"sender":"test-user","type":"plain-large"},{"id":"e3e6e8cc-d403-49af-9e34-5b63bc62aff4","handle":{"type":"__fluid_handle__","url":"/rootDOId/59c55e26-781f-40de-a219-31dec25332aa"},"sender":"test-user","type":"plain-large"},{"id":"6729545b-5a50-4fb8-9229-eee097f0b772","handle":{"type":"__fluid_handle__","url":"/rootDOId/ca0e9520-c0eb-452d-848c-846da2405ee8"},"sender":"test-user","type":"plain-large"},{"id":"1a96fdda-c507-415d-b2e8-ed1380680959","sender":"criminal-maroon-sloth","type":"plain","content":"Aliqua magna amet adipisicing qui nostrud est adipisicing aliquip tempor excepteur incididunt ea. Et commodo velit anim ex est est ad elit sit ut."},{"id":"97d520a4-c400-40cf-ac51-52dc1ee31588","sender":"rational-magenta-kiwi","type":"plain","content":"Dolore esse et do eiusmod sint adipisicing."},{"id":"79170c50-10bd-4f5b-813a-694e8d382883","sender":"increasing-cyan-coyote","type":"plain","content":"Aute tempor adipisicing aliqua et consectetur."},{"id":"d1095d75-d34b-4129-a2fa-7963ac07a726","sender":"increasing-cyan-coyote","type":"plain","content":"In cillum proident fugiat duis minim consectetur laborum."},{"id":"3590a6cb-c17b-432a-8c16-2c34daef6942","sender":"rational-magenta-kiwi","type":"plain","content":"Sit exercitation qui cillum aute ut sunt pariatur labore commodo nulla aliquip tempor. Pariatur voluptate Lorem reprehenderit in labore tempor minim."},{"id":"137c1d54-e16a-49f6-8349-f28a8520e4a6","sender":"increasing-cyan-coyote","type":"plain","content":"Aute proident nostrud veniam non."},{"id":"7210c728-61b1-403c-8486-645f8c5ae298","sender":"increasing-cyan-coyote","type":"plain","content":"cillum laborum duis tempor commodo aliqua aliqua consequat anim in"},{"id":"1bfd6e5a-65d5-42ed-8005-b27511c21402","sender":"criminal-maroon-sloth","type":"plain","content":"Fugiat nostrud quis enim laborum velit irure id eiusmod nulla ullamco est ut. Sit ex et eiusmod pariatur."},{"id":"79f77a77-2b3b-45d3-9272-6096a4099462","sender":"increasing-cyan-coyote","type":"plain","content":"consequat non"},{"id":"e26d002b-3668-41d2-b3d4-23a001b71000","sender":"criminal-maroon-sloth","type":"plain","content":"Pariatur labore fugiat dolor sint dolor qui ullamco proident exercitation consequat amet nostrud."},{"id":"7502a55d-3aa0-47ec-bfa6-84ee19d555e9","sender":"dead-scarlet-walrus","type":"plain","content":"quis deserunt labore veniam sunt id"},{"id":"52e32674-c655-494b-974a-695444fa569c","sender":"increasing-cyan-coyote","type":"plain","content":"Officia incididunt magna tempor nostrud cupidatat exercitation exercitation qui nulla nulla."},{"id":"02dcdaa1-b518-429a-b119-1e2561a8f1fb","sender":"dead-scarlet-walrus","type":"plain","content":"ex duis veniam"}]}}}',
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
													path: "ab9706dc-ef6a-46c5-b728-6d1353cfe12b",
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
													path: "b0ed55c3-e5f6-41c5-bbbb-1f653a186e94",
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
													path: "ca0e9520-c0eb-452d-848c-846da2405ee8",
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
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"subdirectories":{"initial-objects-key":{"ci":{"csn":0,"ccIds":["detached"]},"storage":{"map":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/rootDOId/ab9706dc-ef6a-46c5-b728-6d1353cfe12b"}},"hiddenData":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/rootDOId/b0ed55c3-e5f6-41c5-bbbb-1f653a186e94"}},"signaler":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/3a562a77-a987-4069-a7e6-7f6248e3670e"}}}}}}}',
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
						'{"createContainerRuntimeVersion":"2.0.0-internal.7.1.0","createContainerTimestamp":1702330704065,"summaryNumber":2,"summaryFormatVersion":1,"gcFeature":3,"sessionExpiryTimeoutMs":2592000000,"sweepEnabled":false,"sweepTimeoutMs":3110400000,"message":{"clientId":"c0f2f47c-293d-4134-8f45-d344006cd9fc","clientSequenceNumber":15,"minimumSequenceNumber":17,"referenceSequenceNumber":18,"sequenceNumber":19,"timestamp":1702330732456,"type":"noop"},"telemetryDocumentId":"f71135ac-e201-4449-a580-234ba94e0af7"}',
					encoding: "utf-8",
				},
				path: ".metadata",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content:
						'{"electedClientId":"b4fcb0b9-ed7f-464c-8520-0096d41100b3","electedParentId":"c0f2f47c-293d-4134-8f45-d344006cd9fc","electionSequenceNumber":2}',
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
									'{"gcNodes":{"/":{"outboundRoutes":["/rootDOId"]},"/3a562a77-a987-4069-a7e6-7f6248e3670e":{"outboundRoutes":["/3a562a77-a987-4069-a7e6-7f6248e3670e/root"]},"/3a562a77-a987-4069-a7e6-7f6248e3670e/root":{"outboundRoutes":["/3a562a77-a987-4069-a7e6-7f6248e3670e"]},"/rootDOId":{"outboundRoutes":["/rootDOId/59c55e26-781f-40de-a219-31dec25332aa","/rootDOId/6c9a0944-cdc3-4877-89f1-2b514cc06940","/rootDOId/ab9706dc-ef6a-46c5-b728-6d1353cfe12b","/rootDOId/b0ed55c3-e5f6-41c5-bbbb-1f653a186e94","/rootDOId/ca0e9520-c0eb-452d-848c-846da2405ee8","/rootDOId/root"]},"/rootDOId/59c55e26-781f-40de-a219-31dec25332aa":{"outboundRoutes":["/rootDOId"]},"/rootDOId/6c9a0944-cdc3-4877-89f1-2b514cc06940":{"outboundRoutes":["/rootDOId"]},"/rootDOId/ab9706dc-ef6a-46c5-b728-6d1353cfe12b":{"outboundRoutes":["/rootDOId","/rootDOId/59c55e26-781f-40de-a219-31dec25332aa","/rootDOId/6c9a0944-cdc3-4877-89f1-2b514cc06940","/rootDOId/ca0e9520-c0eb-452d-848c-846da2405ee8"]},"/rootDOId/b0ed55c3-e5f6-41c5-bbbb-1f653a186e94":{"outboundRoutes":["/rootDOId"]},"/rootDOId/ca0e9520-c0eb-452d-848c-846da2405ee8":{"outboundRoutes":["/rootDOId"]},"/rootDOId/root":{"outboundRoutes":["/3a562a77-a987-4069-a7e6-7f6248e3670e","/rootDOId","/rootDOId/ab9706dc-ef6a-46c5-b728-6d1353cfe12b","/rootDOId/b0ed55c3-e5f6-41c5-bbbb-1f653a186e94"]}}}',
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
export const sampleChannelSummaryResult: IWriteSummaryResponse = {
	id: "830f6e63212215df8651ef85bb0085f017bcab28",
};
export const sampleContainerSummaryUpload: IWholeSummaryPayload =
	convertAllUtf8ToBase64<IWholeSummaryPayload>({
		message: "Container summary",
		entries: [
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "blob",
								content:
									'[["c0f2f47c-293d-4134-8f45-d344006cd9fc",{"client":{"details":{"capabilities":{"interactive":true},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0"},"permission":[],"scopes":["doc:read","doc:write"],"user":{"name":"increasing-cyan-coyote","id":"increasing-cyan-coyote","additionalDetails":{"id":"increasing-cyan-coyote","temp":true,"permissions":["read","write"]}},"mode":"write","timestamp":1702330706451},"sequenceNumber":1}],["b4fcb0b9-ed7f-464c-8520-0096d41100b3",{"client":{"details":{"capabilities":{"interactive":false},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0","type":"summarizer"},"permission":[],"scopes":["doc:read","doc:write","summary:write"],"user":{"name":"increasing-cyan-coyote","id":"increasing-cyan-coyote","additionalDetails":{"id":"increasing-cyan-coyote","temp":true,"permissions":["read","write"]}},"mode":"write","timestamp":1702330712699},"sequenceNumber":2}]]',
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
								content: '{"minimumSequenceNumber":17,"sequenceNumber":19}',
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
									'[{"clientId":"b4fcb0b9-ed7f-464c-8520-0096d41100b3","clientSequenceNumber":3,"contents":"{\\"handle\\":\\"830f6e63212215df8651ef85bb0085f017bcab28\\",\\"head\\":\\"f79125fb1911b4c7e142e8ad539458d2f288e155\\",\\"message\\":\\"Summary @19:17\\",\\"parents\\":[\\"f79125fb1911b4c7e142e8ad539458d2f288e155\\"],\\"details\\":{\\"includesProtocolTree\\":false}}","minimumSequenceNumber":18,"referenceSequenceNumber":19,"sequenceNumber":20,"timestamp":1702330756322,"traces":[],"type":"summarize","additionalContent":"{\\"clients\\":[{\\"canEvict\\":true,\\"clientId\\":\\"c0f2f47c-293d-4134-8f45-d344006cd9fc\\",\\"clientSequenceNumber\\":15,\\"lastUpdate\\":1702330732456,\\"nack\\":false,\\"referenceSequenceNumber\\":18,\\"scopes\\":[\\"doc:read\\",\\"doc:write\\"]},{\\"canEvict\\":true,\\"clientId\\":\\"b4fcb0b9-ed7f-464c-8520-0096d41100b3\\",\\"clientSequenceNumber\\":3,\\"lastUpdate\\":1702330756322,\\"nack\\":false,\\"referenceSequenceNumber\\":19,\\"scopes\\":[\\"doc:read\\",\\"doc:write\\",\\"summary:write\\"]}],\\"durableSequenceNumber\\":0,\\"expHash1\\":\\"29ea9dcb\\",\\"logOffset\\":20,\\"sequenceNumber\\":20,\\"signalClientConnectionNumber\\":0,\\"lastSentMSN\\":17,\\"nackMessages\\":[],\\"successfullyStartedLambdas\\":[\\"Scribe\\"],\\"checkpointTimestamp\\":1702330756409}","expHash1":"-52ae219f"}]',
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
									'{"clients":[{"canEvict":true,"clientId":"c0f2f47c-293d-4134-8f45-d344006cd9fc","clientSequenceNumber":15,"lastUpdate":1702330732456,"nack":false,"referenceSequenceNumber":18,"scopes":["doc:read","doc:write"]},{"canEvict":true,"clientId":"b4fcb0b9-ed7f-464c-8520-0096d41100b3","clientSequenceNumber":3,"lastUpdate":1702330756322,"nack":false,"referenceSequenceNumber":19,"scopes":["doc:read","doc:write","summary:write"]}],"durableSequenceNumber":0,"expHash1":"29ea9dcb","logOffset":20,"sequenceNumber":20,"signalClientConnectionNumber":0,"lastSentMSN":17,"nackMessages":[],"successfullyStartedLambdas":["Scribe"],"checkpointTimestamp":1702330756409}',
								encoding: "utf-8",
							},
							path: "deli",
							type: "blob",
						},
						{
							value: {
								type: "blob",
								content:
									'{"lastSummarySequenceNumber":0,"logOffset":19,"minimumSequenceNumber":18,"protocolState":{"sequenceNumber":19,"minimumSequenceNumber":17,"members":[["c0f2f47c-293d-4134-8f45-d344006cd9fc",{"client":{"details":{"capabilities":{"interactive":true},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0"},"permission":[],"scopes":["doc:read","doc:write"],"user":{"name":"increasing-cyan-coyote","id":"increasing-cyan-coyote","additionalDetails":{"id":"increasing-cyan-coyote","temp":true,"permissions":["read","write"]}},"mode":"write","timestamp":1702330706451},"sequenceNumber":1}],["b4fcb0b9-ed7f-464c-8520-0096d41100b3",{"client":{"details":{"capabilities":{"interactive":false},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0","type":"summarizer"},"permission":[],"scopes":["doc:read","doc:write","summary:write"],"user":{"name":"increasing-cyan-coyote","id":"increasing-cyan-coyote","additionalDetails":{"id":"increasing-cyan-coyote","temp":true,"permissions":["read","write"]}},"mode":"write","timestamp":1702330712699},"sequenceNumber":2}]],"proposals":[],"values":[["code",{"key":"code","value":{"package":"no-dynamic-package","config":{}},"approvalSequenceNumber":0,"commitSequenceNumber":0,"sequenceNumber":0}]]},"sequenceNumber":20,"validParentSummaries":["f79125fb1911b4c7e142e8ad539458d2f288e155"],"isCorrupt":false}',
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
			{ path: ".app", type: "tree", id: "830f6e63212215df8651ef85bb0085f017bcab28" },
		],
		sequenceNumber: 19,
		type: "container",
	});
export const sampleContainerSummaryResponse: IWholeFlatSummary =
	convertAllUtf8ToBase64<IWholeFlatSummary>({
		// This is a Commit ID and will vary with each run, because commits are calculated with timestamps.
		id: "249233823956b44862f7fa8b53c106f0520743ba",
		trees: [
			{
				id: "4fd5a75c3cd42f9d210775c5ae51031339b4811b",
				entries: [
					{ type: "tree", path: ".app" },
					{ type: "tree", path: ".app/.channels" },
					{ type: "tree", path: ".app/.channels/3a562a77-a987-4069-a7e6-7f6248e3670e" },
					{
						type: "tree",
						path: ".app/.channels/3a562a77-a987-4069-a7e6-7f6248e3670e/.channels",
					},
					{
						type: "tree",
						path: ".app/.channels/3a562a77-a987-4069-a7e6-7f6248e3670e/.channels/root",
					},
					{
						type: "blob",
						id: "faf720750d1bfe4304b808733b97f7495f6beedc",
						path: ".app/.channels/3a562a77-a987-4069-a7e6-7f6248e3670e/.channels/root/.attributes",
					},
					{
						type: "blob",
						id: "a8f0e0d709d42b998767dcc4a82a4e96bec819a2",
						path: ".app/.channels/3a562a77-a987-4069-a7e6-7f6248e3670e/.channels/root/header",
					},
					{
						type: "blob",
						id: "c0e6e1c73bfd42e2a47071489ad8a41a3b62af1c",
						path: ".app/.channels/3a562a77-a987-4069-a7e6-7f6248e3670e/.component",
					},
					{ type: "tree", path: ".app/.channels/rootDOId" },
					{ type: "tree", path: ".app/.channels/rootDOId/.channels" },
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/59c55e26-781f-40de-a219-31dec25332aa",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/59c55e26-781f-40de-a219-31dec25332aa/.attributes",
					},
					{
						type: "blob",
						id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
						path: ".app/.channels/rootDOId/.channels/59c55e26-781f-40de-a219-31dec25332aa/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/6c9a0944-cdc3-4877-89f1-2b514cc06940",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/6c9a0944-cdc3-4877-89f1-2b514cc06940/.attributes",
					},
					{
						type: "blob",
						id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
						path: ".app/.channels/rootDOId/.channels/6c9a0944-cdc3-4877-89f1-2b514cc06940/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/ab9706dc-ef6a-46c5-b728-6d1353cfe12b",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/ab9706dc-ef6a-46c5-b728-6d1353cfe12b/.attributes",
					},
					{
						type: "blob",
						id: "b4b873b0538629288cee91f8e6728104c2f319f0",
						path: ".app/.channels/rootDOId/.channels/ab9706dc-ef6a-46c5-b728-6d1353cfe12b/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/b0ed55c3-e5f6-41c5-bbbb-1f653a186e94",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/b0ed55c3-e5f6-41c5-bbbb-1f653a186e94/.attributes",
					},
					{
						type: "blob",
						id: "f39311cc21cd0c2ebf40677800a8033b1fd02404",
						path: ".app/.channels/rootDOId/.channels/b0ed55c3-e5f6-41c5-bbbb-1f653a186e94/header",
					},
					{
						type: "tree",
						path: ".app/.channels/rootDOId/.channels/ca0e9520-c0eb-452d-848c-846da2405ee8",
					},
					{
						type: "blob",
						id: "8387d21005fb3ba204cb6b6855f08ac1d58947c4",
						path: ".app/.channels/rootDOId/.channels/ca0e9520-c0eb-452d-848c-846da2405ee8/.attributes",
					},
					{
						type: "blob",
						id: "948d9ce9db24abbfd53a11c871a94fd850974cbf",
						path: ".app/.channels/rootDOId/.channels/ca0e9520-c0eb-452d-848c-846da2405ee8/header",
					},
					{ type: "tree", path: ".app/.channels/rootDOId/.channels/root" },
					{
						type: "blob",
						id: "faf720750d1bfe4304b808733b97f7495f6beedc",
						path: ".app/.channels/rootDOId/.channels/root/.attributes",
					},
					{
						type: "blob",
						id: "0564506cbb1091f7c2086a661db2571c4a4c194b",
						path: ".app/.channels/rootDOId/.channels/root/header",
					},
					{
						type: "blob",
						id: "c35bbe00f9cb9ee99c8af3d4757411abdda3d8f3",
						path: ".app/.channels/rootDOId/.component",
					},
					{
						type: "blob",
						id: "cac6366f2497ec6999751672e7887576ead833ec",
						path: ".app/.electedSummarizer",
					},
					{
						type: "blob",
						id: "07f3d7820e0c88f2ac3e4dc7aee7d6264c82119e",
						path: ".app/.metadata",
					},
					{ type: "tree", path: ".app/gc" },
					{
						type: "blob",
						id: "de745834627c04ae87ce3b270900b43b3e8af243",
						path: ".app/gc/__gc_root",
					},
					{ type: "tree", path: ".logTail" },
					{
						type: "blob",
						id: "444478e4c5a9716ca27f72e438af355e29d7f861",
						path: ".logTail/logTail",
					},
					{ type: "tree", path: ".protocol" },
					{
						type: "blob",
						id: "d1530b02b5e324f650ace779d40a61e997669ca0",
						path: ".protocol/attributes",
					},
					{
						type: "blob",
						id: "582a5fde78ad55ddf83579edf003874c04aa2dc6",
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
						id: "b99120f9d38728469ef20acb96cb56e0f8774828",
						path: ".serviceProtocol/deli",
					},
					{
						type: "blob",
						id: "131d957174f195739d80a9d023209cce8e42ec4b",
						path: ".serviceProtocol/scribe",
					},
				],
				sequenceNumber: undefined,
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
					"eyJibG9icyI6W10sImNvbnRlbnQiOnsibWVzc2FnZXMiOnsidHlwZSI6IlBsYWluIiwidmFsdWUiOlt7ImlkIjoiYmE3Y2YxN2YtNjRjYy00OGQwLWFiYjgtOTNkODJiMWMzNTBlIiwiaGFuZGxlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiL3Jvb3RET0lkLzZjOWEwOTQ0LWNkYzMtNDg3Ny04OWYxLTJiNTE0Y2MwNjk0MCJ9LCJzZW5kZXIiOiJ0ZXN0LXVzZXIiLCJ0eXBlIjoicGxhaW4tbGFyZ2UifSx7ImlkIjoiZTNlNmU4Y2MtZDQwMy00OWFmLTllMzQtNWI2M2JjNjJhZmY0IiwiaGFuZGxlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiL3Jvb3RET0lkLzU5YzU1ZTI2LTc4MWYtNDBkZS1hMjE5LTMxZGVjMjUzMzJhYSJ9LCJzZW5kZXIiOiJ0ZXN0LXVzZXIiLCJ0eXBlIjoicGxhaW4tbGFyZ2UifSx7ImlkIjoiNjcyOTU0NWItNWE1MC00ZmI4LTkyMjktZWVlMDk3ZjBiNzcyIiwiaGFuZGxlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiL3Jvb3RET0lkL2NhMGU5NTIwLWMwZWItNDUyZC04NDhjLTg0NmRhMjQwNWVlOCJ9LCJzZW5kZXIiOiJ0ZXN0LXVzZXIiLCJ0eXBlIjoicGxhaW4tbGFyZ2UifSx7ImlkIjoiMWE5NmZkZGEtYzUwNy00MTVkLWIyZTgtZWQxMzgwNjgwOTU5Iiwic2VuZGVyIjoiY3JpbWluYWwtbWFyb29uLXNsb3RoIiwidHlwZSI6InBsYWluIiwiY29udGVudCI6IkFsaXF1YSBtYWduYSBhbWV0IGFkaXBpc2ljaW5nIHF1aSBub3N0cnVkIGVzdCBhZGlwaXNpY2luZyBhbGlxdWlwIHRlbXBvciBleGNlcHRldXIgaW5jaWRpZHVudCBlYS4gRXQgY29tbW9kbyB2ZWxpdCBhbmltIGV4IGVzdCBlc3QgYWQgZWxpdCBzaXQgdXQuIn0seyJpZCI6Ijk3ZDUyMGE0LWM0MDAtNDBjZi1hYzUxLTUyZGMxZWUzMTU4OCIsInNlbmRlciI6InJhdGlvbmFsLW1hZ2VudGEta2l3aSIsInR5cGUiOiJwbGFpbiIsImNvbnRlbnQiOiJEb2xvcmUgZXNzZSBldCBkbyBlaXVzbW9kIHNpbnQgYWRpcGlzaWNpbmcuIn0seyJpZCI6Ijc5MTcwYzUwLTEwYmQtNGY1Yi04MTNhLTY5NGU4ZDM4Mjg4MyIsInNlbmRlciI6ImluY3JlYXNpbmctY3lhbi1jb3lvdGUiLCJ0eXBlIjoicGxhaW4iLCJjb250ZW50IjoiQXV0ZSB0ZW1wb3IgYWRpcGlzaWNpbmcgYWxpcXVhIGV0IGNvbnNlY3RldHVyLiJ9LHsiaWQiOiJkMTA5NWQ3NS1kMzRiLTQxMjktYTJmYS03OTYzYWMwN2E3MjYiLCJzZW5kZXIiOiJpbmNyZWFzaW5nLWN5YW4tY295b3RlIiwidHlwZSI6InBsYWluIiwiY29udGVudCI6IkluIGNpbGx1bSBwcm9pZGVudCBmdWdpYXQgZHVpcyBtaW5pbSBjb25zZWN0ZXR1ciBsYWJvcnVtLiJ9LHsiaWQiOiIzNTkwYTZjYi1jMTdiLTQzMmEtOGMxNi0yYzM0ZGFlZjY5NDIiLCJzZW5kZXIiOiJyYXRpb25hbC1tYWdlbnRhLWtpd2kiLCJ0eXBlIjoicGxhaW4iLCJjb250ZW50IjoiU2l0IGV4ZXJjaXRhdGlvbiBxdWkgY2lsbHVtIGF1dGUgdXQgc3VudCBwYXJpYXR1ciBsYWJvcmUgY29tbW9kbyBudWxsYSBhbGlxdWlwIHRlbXBvci4gUGFyaWF0dXIgdm9sdXB0YXRlIExvcmVtIHJlcHJlaGVuZGVyaXQgaW4gbGFib3JlIHRlbXBvciBtaW5pbS4ifSx7ImlkIjoiMTM3YzFkNTQtZTE2YS00OWY2LTgzNDktZjI4YTg1MjBlNGE2Iiwic2VuZGVyIjoiaW5jcmVhc2luZy1jeWFuLWNveW90ZSIsInR5cGUiOiJwbGFpbiIsImNvbnRlbnQiOiJBdXRlIHByb2lkZW50IG5vc3RydWQgdmVuaWFtIG5vbi4ifSx7ImlkIjoiNzIxMGM3MjgtNjFiMS00MDNjLTg0ODYtNjQ1ZjhjNWFlMjk4Iiwic2VuZGVyIjoiaW5jcmVhc2luZy1jeWFuLWNveW90ZSIsInR5cGUiOiJwbGFpbiIsImNvbnRlbnQiOiJjaWxsdW0gbGFib3J1bSBkdWlzIHRlbXBvciBjb21tb2RvIGFsaXF1YSBhbGlxdWEgY29uc2VxdWF0IGFuaW0gaW4ifSx7ImlkIjoiMWJmZDZlNWEtNjVkNS00MmVkLTgwMDUtYjI3NTExYzIxNDAyIiwic2VuZGVyIjoiY3JpbWluYWwtbWFyb29uLXNsb3RoIiwidHlwZSI6InBsYWluIiwiY29udGVudCI6IkZ1Z2lhdCBub3N0cnVkIHF1aXMgZW5pbSBsYWJvcnVtIHZlbGl0IGlydXJlIGlkIGVpdXNtb2QgbnVsbGEgdWxsYW1jbyBlc3QgdXQuIFNpdCBleCBldCBlaXVzbW9kIHBhcmlhdHVyLiJ9LHsiaWQiOiI3OWY3N2E3Ny0yYjNiLTQ1ZDMtOTI3Mi02MDk2YTQwOTk0NjIiLCJzZW5kZXIiOiJpbmNyZWFzaW5nLWN5YW4tY295b3RlIiwidHlwZSI6InBsYWluIiwiY29udGVudCI6ImNvbnNlcXVhdCBub24ifSx7ImlkIjoiZTI2ZDAwMmItMzY2OC00MWQyLWIzZDQtMjNhMDAxYjcxMDAwIiwic2VuZGVyIjoiY3JpbWluYWwtbWFyb29uLXNsb3RoIiwidHlwZSI6InBsYWluIiwiY29udGVudCI6IlBhcmlhdHVyIGxhYm9yZSBmdWdpYXQgZG9sb3Igc2ludCBkb2xvciBxdWkgdWxsYW1jbyBwcm9pZGVudCBleGVyY2l0YXRpb24gY29uc2VxdWF0IGFtZXQgbm9zdHJ1ZC4ifSx7ImlkIjoiNzUwMmE1NWQtM2FhMC00N2VjLWJmYTYtODRlZTE5ZDU1NWU5Iiwic2VuZGVyIjoiZGVhZC1zY2FybGV0LXdhbHJ1cyIsInR5cGUiOiJwbGFpbiIsImNvbnRlbnQiOiJxdWlzIGRlc2VydW50IGxhYm9yZSB2ZW5pYW0gc3VudCBpZCJ9LHsiaWQiOiI1MmUzMjY3NC1jNjU1LTQ5NGItOTc0YS02OTU0NDRmYTU2OWMiLCJzZW5kZXIiOiJpbmNyZWFzaW5nLWN5YW4tY295b3RlIiwidHlwZSI6InBsYWluIiwiY29udGVudCI6Ik9mZmljaWEgaW5jaWRpZHVudCBtYWduYSB0ZW1wb3Igbm9zdHJ1ZCBjdXBpZGF0YXQgZXhlcmNpdGF0aW9uIGV4ZXJjaXRhdGlvbiBxdWkgbnVsbGEgbnVsbGEuIn0seyJpZCI6IjAyZGNkYWExLWI1MTgtNDI5YS1iMTE5LTFlMjU2MWE4ZjFmYiIsInNlbmRlciI6ImRlYWQtc2NhcmxldC13YWxydXMiLCJ0eXBlIjoicGxhaW4iLCJjb250ZW50IjoiZXggZHVpcyB2ZW5pYW0ifV19fX0=",
				encoding: "base64",
				id: "b4b873b0538629288cee91f8e6728104c2f319f0",
				size: 3856,
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
					"eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL2RpcmVjdG9yeSIsInNuYXBzaG90Rm9ybWF0VmVyc2lvbiI6IjAuMSIsInBhY2thZ2VWZXJzaW9uIjoiMi4wLjAtaW50ZXJuYWwuNy4xLjAifQ==",
				encoding: "base64",
				id: "faf720750d1bfe4304b808733b97f7495f6beedc",
				size: 168,
			},
			{
				content:
					"eyJibG9icyI6W10sImNvbnRlbnQiOnsiY2kiOnsiY3NuIjowLCJjY0lkcyI6W119LCJzdWJkaXJlY3RvcmllcyI6eyJpbml0aWFsLW9iamVjdHMta2V5Ijp7ImNpIjp7ImNzbiI6MCwiY2NJZHMiOlsiZGV0YWNoZWQiXX0sInN0b3JhZ2UiOnsibWFwIjp7InR5cGUiOiJQbGFpbiIsInZhbHVlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiL3Jvb3RET0lkL2FiOTcwNmRjLWVmNmEtNDZjNS1iNzI4LTZkMTM1M2NmZTEyYiJ9fSwiaGlkZGVuRGF0YSI6eyJ0eXBlIjoiUGxhaW4iLCJ2YWx1ZSI6eyJ0eXBlIjoiX19mbHVpZF9oYW5kbGVfXyIsInVybCI6Ii9yb290RE9JZC9iMGVkNTVjMy1lNWY2LTQxYzUtYmJiYi0xZjY1M2ExODZlOTQifX0sInNpZ25hbGVyIjp7InR5cGUiOiJQbGFpbiIsInZhbHVlIjp7InR5cGUiOiJfX2ZsdWlkX2hhbmRsZV9fIiwidXJsIjoiLzNhNTYyYTc3LWE5ODctNDA2OS1hN2U2LTdmNjI0OGUzNjcwZSJ9fX19fX19",
				encoding: "base64",
				id: "0564506cbb1091f7c2086a661db2571c4a4c194b",
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
					"eyJlbGVjdGVkQ2xpZW50SWQiOiJiNGZjYjBiOS1lZDdmLTQ2NGMtODUyMC0wMDk2ZDQxMTAwYjMiLCJlbGVjdGVkUGFyZW50SWQiOiJjMGYyZjQ3Yy0yOTNkLTQxMzQtOGY0NS1kMzQ0MDA2Y2Q5ZmMiLCJlbGVjdGlvblNlcXVlbmNlTnVtYmVyIjoyfQ==",
				encoding: "base64",
				id: "cac6366f2497ec6999751672e7887576ead833ec",
				size: 192,
			},
			{
				content:
					"eyJjcmVhdGVDb250YWluZXJSdW50aW1lVmVyc2lvbiI6IjIuMC4wLWludGVybmFsLjcuMS4wIiwiY3JlYXRlQ29udGFpbmVyVGltZXN0YW1wIjoxNzAyMzMwNzA0MDY1LCJzdW1tYXJ5TnVtYmVyIjoyLCJzdW1tYXJ5Rm9ybWF0VmVyc2lvbiI6MSwiZ2NGZWF0dXJlIjozLCJzZXNzaW9uRXhwaXJ5VGltZW91dE1zIjoyNTkyMDAwMDAwLCJzd2VlcEVuYWJsZWQiOmZhbHNlLCJzd2VlcFRpbWVvdXRNcyI6MzExMDQwMDAwMCwibWVzc2FnZSI6eyJjbGllbnRJZCI6ImMwZjJmNDdjLTI5M2QtNDEzNC04ZjQ1LWQzNDQwMDZjZDlmYyIsImNsaWVudFNlcXVlbmNlTnVtYmVyIjoxNSwibWluaW11bVNlcXVlbmNlTnVtYmVyIjoxNywicmVmZXJlbmNlU2VxdWVuY2VOdW1iZXIiOjE4LCJzZXF1ZW5jZU51bWJlciI6MTksInRpbWVzdGFtcCI6MTcwMjMzMDczMjQ1NiwidHlwZSI6Im5vb3AifSwidGVsZW1ldHJ5RG9jdW1lbnRJZCI6ImY3MTEzNWFjLWUyMDEtNDQ0OS1hNTgwLTIzNGJhOTRlMGFmNyJ9",
				encoding: "base64",
				id: "07f3d7820e0c88f2ac3e4dc7aee7d6264c82119e",
				size: 672,
			},
			{
				content:
					"eyJnY05vZGVzIjp7Ii8iOnsib3V0Ym91bmRSb3V0ZXMiOlsiL3Jvb3RET0lkIl19LCIvM2E1NjJhNzctYTk4Ny00MDY5LWE3ZTYtN2Y2MjQ4ZTM2NzBlIjp7Im91dGJvdW5kUm91dGVzIjpbIi8zYTU2MmE3Ny1hOTg3LTQwNjktYTdlNi03ZjYyNDhlMzY3MGUvcm9vdCJdfSwiLzNhNTYyYTc3LWE5ODctNDA2OS1hN2U2LTdmNjI0OGUzNjcwZS9yb290Ijp7Im91dGJvdW5kUm91dGVzIjpbIi8zYTU2MmE3Ny1hOTg3LTQwNjktYTdlNi03ZjYyNDhlMzY3MGUiXX0sIi9yb290RE9JZCI6eyJvdXRib3VuZFJvdXRlcyI6WyIvcm9vdERPSWQvNTljNTVlMjYtNzgxZi00MGRlLWEyMTktMzFkZWMyNTMzMmFhIiwiL3Jvb3RET0lkLzZjOWEwOTQ0LWNkYzMtNDg3Ny04OWYxLTJiNTE0Y2MwNjk0MCIsIi9yb290RE9JZC9hYjk3MDZkYy1lZjZhLTQ2YzUtYjcyOC02ZDEzNTNjZmUxMmIiLCIvcm9vdERPSWQvYjBlZDU1YzMtZTVmNi00MWM1LWJiYmItMWY2NTNhMTg2ZTk0IiwiL3Jvb3RET0lkL2NhMGU5NTIwLWMwZWItNDUyZC04NDhjLTg0NmRhMjQwNWVlOCIsIi9yb290RE9JZC9yb290Il19LCIvcm9vdERPSWQvNTljNTVlMjYtNzgxZi00MGRlLWEyMTktMzFkZWMyNTMzMmFhIjp7Im91dGJvdW5kUm91dGVzIjpbIi9yb290RE9JZCJdfSwiL3Jvb3RET0lkLzZjOWEwOTQ0LWNkYzMtNDg3Ny04OWYxLTJiNTE0Y2MwNjk0MCI6eyJvdXRib3VuZFJvdXRlcyI6WyIvcm9vdERPSWQiXX0sIi9yb290RE9JZC9hYjk3MDZkYy1lZjZhLTQ2YzUtYjcyOC02ZDEzNTNjZmUxMmIiOnsib3V0Ym91bmRSb3V0ZXMiOlsiL3Jvb3RET0lkIiwiL3Jvb3RET0lkLzU5YzU1ZTI2LTc4MWYtNDBkZS1hMjE5LTMxZGVjMjUzMzJhYSIsIi9yb290RE9JZC82YzlhMDk0NC1jZGMzLTQ4NzctODlmMS0yYjUxNGNjMDY5NDAiLCIvcm9vdERPSWQvY2EwZTk1MjAtYzBlYi00NTJkLTg0OGMtODQ2ZGEyNDA1ZWU4Il19LCIvcm9vdERPSWQvYjBlZDU1YzMtZTVmNi00MWM1LWJiYmItMWY2NTNhMTg2ZTk0Ijp7Im91dGJvdW5kUm91dGVzIjpbIi9yb290RE9JZCJdfSwiL3Jvb3RET0lkL2NhMGU5NTIwLWMwZWItNDUyZC04NDhjLTg0NmRhMjQwNWVlOCI6eyJvdXRib3VuZFJvdXRlcyI6WyIvcm9vdERPSWQiXX0sIi9yb290RE9JZC9yb290Ijp7Im91dGJvdW5kUm91dGVzIjpbIi8zYTU2MmE3Ny1hOTg3LTQwNjktYTdlNi03ZjYyNDhlMzY3MGUiLCIvcm9vdERPSWQiLCIvcm9vdERPSWQvYWI5NzA2ZGMtZWY2YS00NmM1LWI3MjgtNmQxMzUzY2ZlMTJiIiwiL3Jvb3RET0lkL2IwZWQ1NWMzLWU1ZjYtNDFjNS1iYmJiLTFmNjUzYTE4NmU5NCJdfX19",
				encoding: "base64",
				id: "de745834627c04ae87ce3b270900b43b3e8af243",
				size: 1736,
			},
			{
				content:
					'[{"clientId":"b4fcb0b9-ed7f-464c-8520-0096d41100b3","clientSequenceNumber":3,"contents":"{\\"handle\\":\\"830f6e63212215df8651ef85bb0085f017bcab28\\",\\"head\\":\\"f79125fb1911b4c7e142e8ad539458d2f288e155\\",\\"message\\":\\"Summary @19:17\\",\\"parents\\":[\\"f79125fb1911b4c7e142e8ad539458d2f288e155\\"],\\"details\\":{\\"includesProtocolTree\\":false}}","minimumSequenceNumber":18,"referenceSequenceNumber":19,"sequenceNumber":20,"timestamp":1702330756322,"traces":[],"type":"summarize","additionalContent":"{\\"clients\\":[{\\"canEvict\\":true,\\"clientId\\":\\"c0f2f47c-293d-4134-8f45-d344006cd9fc\\",\\"clientSequenceNumber\\":15,\\"lastUpdate\\":1702330732456,\\"nack\\":false,\\"referenceSequenceNumber\\":18,\\"scopes\\":[\\"doc:read\\",\\"doc:write\\"]},{\\"canEvict\\":true,\\"clientId\\":\\"b4fcb0b9-ed7f-464c-8520-0096d41100b3\\",\\"clientSequenceNumber\\":3,\\"lastUpdate\\":1702330756322,\\"nack\\":false,\\"referenceSequenceNumber\\":19,\\"scopes\\":[\\"doc:read\\",\\"doc:write\\",\\"summary:write\\"]}],\\"durableSequenceNumber\\":0,\\"expHash1\\":\\"29ea9dcb\\",\\"logOffset\\":20,\\"sequenceNumber\\":20,\\"signalClientConnectionNumber\\":0,\\"lastSentMSN\\":17,\\"nackMessages\\":[],\\"successfullyStartedLambdas\\":[\\"Scribe\\"],\\"checkpointTimestamp\\":1702330756409}","expHash1":"-52ae219f"}]',
				encoding: "utf-8",
				id: "444478e4c5a9716ca27f72e438af355e29d7f861",
				size: 1232,
			},
			{
				content: '{"minimumSequenceNumber":17,"sequenceNumber":19}',
				encoding: "utf-8",
				id: "d1530b02b5e324f650ace779d40a61e997669ca0",
				size: 48,
			},
			{
				content:
					'[["c0f2f47c-293d-4134-8f45-d344006cd9fc",{"client":{"details":{"capabilities":{"interactive":true},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0"},"permission":[],"scopes":["doc:read","doc:write"],"user":{"name":"increasing-cyan-coyote","id":"increasing-cyan-coyote","additionalDetails":{"id":"increasing-cyan-coyote","temp":true,"permissions":["read","write"]}},"mode":"write","timestamp":1702330706451},"sequenceNumber":1}],["b4fcb0b9-ed7f-464c-8520-0096d41100b3",{"client":{"details":{"capabilities":{"interactive":false},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0","type":"summarizer"},"permission":[],"scopes":["doc:read","doc:write","summary:write"],"user":{"name":"increasing-cyan-coyote","id":"increasing-cyan-coyote","additionalDetails":{"id":"increasing-cyan-coyote","temp":true,"permissions":["read","write"]}},"mode":"write","timestamp":1702330712699},"sequenceNumber":2}]]',
				encoding: "utf-8",
				id: "582a5fde78ad55ddf83579edf003874c04aa2dc6",
				size: 1332,
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
					'{"clients":[{"canEvict":true,"clientId":"c0f2f47c-293d-4134-8f45-d344006cd9fc","clientSequenceNumber":15,"lastUpdate":1702330732456,"nack":false,"referenceSequenceNumber":18,"scopes":["doc:read","doc:write"]},{"canEvict":true,"clientId":"b4fcb0b9-ed7f-464c-8520-0096d41100b3","clientSequenceNumber":3,"lastUpdate":1702330756322,"nack":false,"referenceSequenceNumber":19,"scopes":["doc:read","doc:write","summary:write"]}],"durableSequenceNumber":0,"expHash1":"29ea9dcb","logOffset":20,"sequenceNumber":20,"signalClientConnectionNumber":0,"lastSentMSN":17,"nackMessages":[],"successfullyStartedLambdas":["Scribe"],"checkpointTimestamp":1702330756409}',
				encoding: "utf-8",
				id: "b99120f9d38728469ef20acb96cb56e0f8774828",
				size: 649,
			},
			{
				content:
					'{"lastSummarySequenceNumber":0,"logOffset":19,"minimumSequenceNumber":18,"protocolState":{"sequenceNumber":19,"minimumSequenceNumber":17,"members":[["c0f2f47c-293d-4134-8f45-d344006cd9fc",{"client":{"details":{"capabilities":{"interactive":true},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0"},"permission":[],"scopes":["doc:read","doc:write"],"user":{"name":"increasing-cyan-coyote","id":"increasing-cyan-coyote","additionalDetails":{"id":"increasing-cyan-coyote","temp":true,"permissions":["read","write"]}},"mode":"write","timestamp":1702330706451},"sequenceNumber":1}],["b4fcb0b9-ed7f-464c-8520-0096d41100b3",{"client":{"details":{"capabilities":{"interactive":false},"environment":"; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0; loaderVersion:2.0.0-internal.7.1.0","type":"summarizer"},"permission":[],"scopes":["doc:read","doc:write","summary:write"],"user":{"name":"increasing-cyan-coyote","id":"increasing-cyan-coyote","additionalDetails":{"id":"increasing-cyan-coyote","temp":true,"permissions":["read","write"]}},"mode":"write","timestamp":1702330712699},"sequenceNumber":2}]],"proposals":[],"values":[["code",{"key":"code","value":{"package":"no-dynamic-package","config":{}},"approvalSequenceNumber":0,"commitSequenceNumber":0,"sequenceNumber":0}]]},"sequenceNumber":20,"validParentSummaries":["f79125fb1911b4c7e142e8ad539458d2f288e155"],"isCorrupt":false}',
				encoding: "utf-8",
				id: "131d957174f195739d80a9d023209cce8e42ec4b",
				size: 1761,
			},
		],
	});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromUtf8ToBase64 } from "@fluidframework/common-utils";
import * as git from "@fluidframework/gitresources";
import { strict as assert } from "assert";
import { Historian, ICredentials, getAuthorizationTokenFromCredentials } from "../historian";
import type { FetchFn } from "../fetchTypes";
import { BasicRestWrapper, RestWrapper } from "../restWrapper";
import { IWholeSummaryPayload, IWriteSummaryResponse } from "../storageContracts";

describe("Historian", () => {
	const endpoint = "http://test:3000";
	const sha = "123456abcdef";
	const ref = "xyz789";
	const tag = "1a2b3c";

	const initialCredentials: ICredentials = {
		user: "test-user",
		password: "test-password",
	};
	const freshCredentials: ICredentials = {
		user: "test-user",
		password: "new-test-password",
	};

	const mockAuthor: git.IAuthor = {
		name: "Fabrikam",
		email: "contoso@microsoft.com",
		date: new Date().toTimeString(),
	};
	const mockBlob: git.IBlob = {
		content: "Hello, World!",
		encoding: "utf-8",
		url: `${endpoint}/blob/${sha}`,
		sha,
		size: 20,
	};
	const mockCommitDetails: git.ICommitDetails = {
		url: `${endpoint}/commit/${ref}/details`,
		sha,
		commit: {
			url: `${endpoint}/commit/${ref}/commit`,
			author: mockAuthor,
			committer: mockAuthor,
			message: "test",
			tree: {
				sha,
				url: `${endpoint}/commit/${ref}/tree`,
			},
		},
		parents: [],
	};
	const mockCommit: git.ICommit = {
		...mockCommitDetails.commit,
		sha,
		parents: [],
	};
	const mockRef: git.IRef = {
		ref,
		url: `${endpoint}/ref/${ref}`,
		object: {
			type: "test-ref",
			sha,
			url: `${endpoint}/ref/${ref}/object`,
		},
	};
	const mockTag: git.ITag = {
		tag,
		sha,
		url: `${endpoint}/tags/${tag}`,
		message: "v0.1.0-test",
		tagger: mockAuthor,
		object: {
			type: "test-tag",
			sha,
			url: `${endpoint}/tags/${tag}/object`,
		},
	};
	const mockTree: git.ITree = {
		sha,
		url: `${endpoint}/trees/${sha}`,
		tree: [],
	};
	const mockSummaryWriteResponse: IWriteSummaryResponse = {
		id: "some-summary-id",
	};

	// Same decoding as FluidFramework/server/historian/packages/historian-base/src/routes/utils.ts createGitService()
	const decodeHistorianCredentials = (authHeader: string): ICredentials | undefined => {
		if (!authHeader) {
			return undefined;
		}
		const base64TokenMatch = authHeader.match(/Basic (.+)/);
		if (!base64TokenMatch) {
			throw new Error("Malformed authorization token");
		}
		const encoded = Buffer.from(base64TokenMatch[1], "base64").toString();

		const tokenMatch = encoded.match(/(.+):(.+)/);
		if (!tokenMatch) {
			throw new Error("Malformed authorization token");
		}

		return {
			user: tokenMatch[1],
			password: tokenMatch[2],
		};
	};

	/**
	 * Creates a mock FetchFn that routes based on method and URL, validates credentials,
	 * and returns mock data.
	 */
	const createMockFetch = (
		routes: Map<
			string,
			{
				validCredentials: ICredentials;
				responseData: any;
			}
		>,
	): FetchFn => {
		return async (
			url: string | URL | Request,
			init?: RequestInit,
		): Promise<Response> => {
			const urlStr = url.toString();
			const method = (init?.method ?? "GET").toUpperCase();

			// Find a matching route
			for (const [routeKey, config] of routes) {
				if (urlStr.includes(routeKey)) {
					const headers = init?.headers as Record<string, string> | undefined;
					const authHeader = headers?.Authorization ?? "";
					const decodedCredentials = decodeHistorianCredentials(authHeader);
					if (
						!decodedCredentials ||
						decodedCredentials.password !== config.validCredentials.password
					) {
						return new Response(JSON.stringify(config.responseData), {
							status: 401,
							headers: { "Content-Type": "application/json" },
						});
					}
					return new Response(JSON.stringify(config.responseData), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}
			}

			return new Response("Not Found", { status: 404 });
		};
	};

	let historian: Historian;
	let restWrapper: RestWrapper;
	let mockFetchFn: FetchFn;

	const setupWithRoutes = (
		routes: Map<
			string,
			{ validCredentials: ICredentials; responseData: any }
		>,
	) => {
		mockFetchFn = createMockFetch(routes);
		const initialHeaders = {
			Authorization: getAuthorizationTokenFromCredentials(initialCredentials),
		};
		const initialQueryString = {
			token: fromUtf8ToBase64(`${initialCredentials.user}`),
		};
		const newHeaders = {
			Authorization: getAuthorizationTokenFromCredentials(freshCredentials),
		};
		restWrapper = new BasicRestWrapper(
			endpoint,
			initialQueryString,
			undefined,
			undefined,
			initialHeaders,
			mockFetchFn,
			undefined,
			() => newHeaders,
		);
		historian = new Historian(endpoint, true, false, restWrapper);
	};

	describe("getHeader", () => {
		describe("with Historian API", () => {
			it("succeeds on 200", async () => {
				const response = { "Content-Type": "text" };
				const routes = new Map([
					[
						`/headers/${encodeURIComponent(sha)}`,
						{ validCredentials: initialCredentials, responseData: response },
					],
				]);
				setupWithRoutes(routes);
				const received = await historian.getHeader(sha);
				assert.deepStrictEqual(received, response);
			});
			it("retries once with new credentials on 401", async () => {
				const response = { "Content-Type": "text" };
				const routes = new Map([
					[
						`/headers/${encodeURIComponent(sha)}`,
						{ validCredentials: freshCredentials, responseData: response },
					],
				]);
				setupWithRoutes(routes);
				const received = await historian.getHeader(sha);
				assert.deepStrictEqual(received, response);
			});
		});
	});

	describe("getFullTree", () => {
		const response: any = "🌲";
		it("succeeds on 200", async () => {
			const routes = new Map([
				[
					`/tree/${encodeURIComponent(sha)}`,
					{ validCredentials: initialCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.getFullTree(sha);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			const routes = new Map([
				[
					`/tree/${encodeURIComponent(sha)}`,
					{ validCredentials: freshCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.getFullTree(sha);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("getBlob", () => {
		const response = { ...mockBlob };
		it("succeeds on 200", async () => {
			const routes = new Map([
				[
					`/git/blobs/${encodeURIComponent(sha)}`,
					{ validCredentials: initialCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.getBlob(sha);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			const routes = new Map([
				[
					`/git/blobs/${encodeURIComponent(sha)}`,
					{ validCredentials: freshCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.getBlob(sha);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("createBlob", () => {
		const blobParams: git.ICreateBlobParams = {
			content: "Hello, World",
			encoding: "utf-8",
		};
		const response: git.ICreateBlobResponse = {
			sha,
			url: `${endpoint}/blobs/${sha}`,
		};
		it("succeeds on 200", async () => {
			const routes = new Map([
				[
					`/git/blobs`,
					{ validCredentials: initialCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.createBlob(blobParams);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			const routes = new Map([
				[
					`/git/blobs`,
					{ validCredentials: freshCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.createBlob(blobParams);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("getContent", () => {
		const path = "document-id";
		const response: any = "📄";
		it("succeeds on 200", async () => {
			const routes = new Map([
				[
					`/contents/${path}`,
					{ validCredentials: initialCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.getContent(path, ref);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			const routes = new Map([
				[
					`/contents/${path}`,
					{ validCredentials: freshCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.getContent(path, ref);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("getCommits", () => {
		const count = 1;
		const response: git.ICommitDetails[] = [mockCommitDetails];
		it("succeeds on 200", async () => {
			const routes = new Map([
				[
					`/commits`,
					{ validCredentials: initialCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.getCommits(sha, count);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			const routes = new Map([
				[
					`/commits`,
					{ validCredentials: freshCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.getCommits(sha, count);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("getCommit", () => {
		const response = mockCommit;
		it("succeeds on 200", async () => {
			const routes = new Map([
				[
					`/git/commits/${encodeURIComponent(sha)}`,
					{ validCredentials: initialCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.getCommit(sha);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			const routes = new Map([
				[
					`/git/commits/${encodeURIComponent(sha)}`,
					{ validCredentials: freshCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.getCommit(sha);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("getRefs", () => {
		const response: git.IRef[] = [mockRef];
		it("succeeds on 200", async () => {
			const routes = new Map([
				[
					`/git/refs`,
					{ validCredentials: initialCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.getRefs();
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			const routes = new Map([
				[
					`/git/refs`,
					{ validCredentials: freshCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.getRefs();
			assert.deepStrictEqual(received, response);
		});
	});

	describe("getRef", () => {
		const response = mockRef;
		it("succeeds on 200", async () => {
			const routes = new Map([
				[
					`/git/refs/${ref}`,
					{ validCredentials: initialCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.getRef(ref);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			const routes = new Map([
				[
					`/git/refs/${ref}`,
					{ validCredentials: freshCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.getRef(ref);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("createRef", () => {
		const refParams: git.ICreateRefParams = { ref, sha };
		const response = mockRef;
		it("succeeds on 200", async () => {
			const routes = new Map([
				[
					`/git/refs`,
					{ validCredentials: initialCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.createRef(refParams);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			const routes = new Map([
				[
					`/git/refs`,
					{ validCredentials: freshCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.createRef(refParams);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("createSummary", () => {
		const summaryPayload: IWholeSummaryPayload = {
			type: "container",
			message: "hello",
			sequenceNumber: 1,
			entries: [
				{
					path: "/some/tree/path",
					type: "tree",
					id: "some-tree-handle-id",
				},
			],
		};
		const response = mockSummaryWriteResponse;
		it("succeeds on 200", async () => {
			const routes = new Map([
				[
					`/git/summaries`,
					{ validCredentials: initialCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.createSummary(summaryPayload);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			const routes = new Map([
				[
					`/git/summaries`,
					{ validCredentials: freshCredentials, responseData: response },
				],
			]);
			setupWithRoutes(routes);
			const received = await historian.createSummary(summaryPayload);
			assert.deepStrictEqual(received, response);
		});
	});
});

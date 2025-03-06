/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@fluidframework/gitresources";
import assert from "assert";
import Axios, { AxiosRequestConfig } from "axios";
import AxiosMockAdapter from "axios-mock-adapter";
import { fromUtf8ToBase64 } from "../../common-utils";
import { Historian, ICredentials, getAuthorizationTokenFromCredentials } from "../../historian";
import { BasicRestWrapper, RestWrapper } from "../../restWrapper";
import { IWholeSummaryPayload, IWriteSummaryResponse } from "../../storageContracts";

describe("Historian", () => {
	const endpoint = "http://test:3000";
	const sha = "123456abcdef";
	const ref = "xyz789";
	const tag = "1a2b3c";
	const axiosInstance = Axios.create();
	const axiosMock = new AxiosMockAdapter(axiosInstance);
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

	let historian: Historian;
	let restWrapper: RestWrapper;
	// Same decoding as FluidFramework/server/historian/packages/historian-base/src/routes/utils.ts createGitService()
	const decodeHistorianCredentials = (authHeader: string): ICredentials => {
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
	const mockReplyWithAuth =
		(validCredentials: ICredentials, successResponseData?: any) =>
		(req: AxiosRequestConfig): any[] => {
			const decodedCredentials = decodeHistorianCredentials(
				req.headers?.Authorization as string,
			);
			if (!decodedCredentials || decodedCredentials.password !== validCredentials.password) {
				return [401, successResponseData];
			}
			return [200, successResponseData];
		};
	const getUrlWithToken = (
		path: string,
		credentials: ICredentials,
		additionalQueryParams?: any,
	) => {
		return `${endpoint}${path}?${new URLSearchParams({
			token: fromUtf8ToBase64(`${credentials.user}`),
			...additionalQueryParams,
		}).toString()}`;
	};

	beforeEach(() => {
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
			axiosInstance,
			undefined,
			() => newHeaders,
		);
		historian = new Historian(endpoint, true, false, restWrapper);
		axiosMock.reset();
	});

	describe("getHeader", () => {
		describe("with Historian API", () => {
			const url = getUrlWithToken(`/headers/${encodeURIComponent(sha)}`, initialCredentials);
			const response: any = {
				"Content-Type": "text",
			};
			it("succeeds on 200", async () => {
				axiosMock.onGet(url).reply(mockReplyWithAuth(initialCredentials, response));
				const received = await historian.getHeader(sha);
				assert.deepStrictEqual(received, response);
			});
			it("retries once with new credentials on 401", async () => {
				axiosMock.onGet(url).reply(mockReplyWithAuth(freshCredentials, response));
				const received = await historian.getHeader(sha);
				assert.deepStrictEqual(received, response);
			});
		});
	});

	describe("getFullTree", () => {
		const url = getUrlWithToken(`/tree/${encodeURIComponent(sha)}`, initialCredentials);
		const response: any = "🌲";
		it("succeeds on 200", async () => {
			axiosMock.onGet(url).reply(mockReplyWithAuth(initialCredentials, response));
			const received = await historian.getFullTree(sha);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			axiosMock.onGet(url).reply(mockReplyWithAuth(freshCredentials, response));
			const received = await historian.getFullTree(sha);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("getBlob", () => {
		const url = getUrlWithToken(`/git/blobs/${encodeURIComponent(sha)}`, initialCredentials);
		const response: git.IBlob = {
			...mockBlob,
		};
		it("succeeds on 200", async () => {
			axiosMock.onGet(url).reply(mockReplyWithAuth(initialCredentials, response));
			const received = await historian.getBlob(sha);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			axiosMock.onGet(url).reply(mockReplyWithAuth(freshCredentials, response));
			const received = await historian.getBlob(sha);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("createBlob", () => {
		const url = getUrlWithToken(`/git/blobs`, initialCredentials);
		const blobParams: git.ICreateBlobParams = {
			content: "Hello, World",
			encoding: "utf-8",
		};
		const response: git.ICreateBlobResponse = {
			sha,
			url: `${endpoint}/blobs/${sha}`,
		};
		it("succeeds on 200", async () => {
			axiosMock
				.onPost(url, blobParams)
				.reply(mockReplyWithAuth(initialCredentials, response));
			const received = await historian.createBlob(blobParams);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			axiosMock.onPost(url, blobParams).reply(mockReplyWithAuth(freshCredentials, response));
			const received = await historian.createBlob(blobParams);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("getContent", () => {
		const path = "document-id";
		const url = getUrlWithToken(`/contents/${path}`, initialCredentials, { ref });
		const response: any = "📄";
		it("succeeds on 200", async () => {
			axiosMock.onGet(url).reply(mockReplyWithAuth(initialCredentials, response));
			const received = await historian.getContent(path, ref);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			axiosMock.onGet(url).reply(mockReplyWithAuth(freshCredentials, response));
			const received = await historian.getContent(path, ref);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("getCommits", () => {
		const count = 1;
		const url = getUrlWithToken(`/commits`, initialCredentials, { count, sha });
		const response: git.ICommitDetails[] = [mockCommitDetails];
		it("succeeds on 200", async () => {
			axiosMock.onGet(url).reply(mockReplyWithAuth(initialCredentials, response));
			const received = await historian.getCommits(sha, count);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			axiosMock.onGet(url).reply(mockReplyWithAuth(freshCredentials, response));
			const received = await historian.getCommits(sha, count);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("getCommit", () => {
		const url = getUrlWithToken(`/git/commits/${encodeURIComponent(sha)}`, initialCredentials);
		const response = mockCommit;
		it("succeeds on 200", async () => {
			axiosMock.onGet(url).reply(mockReplyWithAuth(initialCredentials, response));
			const received = await historian.getCommit(sha);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			axiosMock.onGet(url).reply(mockReplyWithAuth(freshCredentials, response));
			const received = await historian.getCommit(sha);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("createCommit", () => {
		const commitParams: git.ICreateCommitParams = {
			message: mockCommitDetails.commit.message,
			author: mockAuthor,
			tree: JSON.stringify(mockCommitDetails.commit.tree),
			parents: [],
		};
		const url = getUrlWithToken(`/git/commits`, initialCredentials);
		const response = mockCommit;
		it("succeeds on 200", async () => {
			axiosMock
				.onPost(url, commitParams)
				.reply(mockReplyWithAuth(initialCredentials, response));
			const received = await historian.createCommit(commitParams);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			axiosMock
				.onPost(url, commitParams)
				.reply(mockReplyWithAuth(freshCredentials, response));
			const received = await historian.createCommit(commitParams);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("getRefs", () => {
		const url = getUrlWithToken(`/git/refs`, initialCredentials);
		const response: git.IRef[] = [mockRef];
		it("succeeds on 200", async () => {
			axiosMock.onGet(url).reply(mockReplyWithAuth(initialCredentials, response));
			const received = await historian.getRefs();
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			axiosMock.onGet(url).reply(mockReplyWithAuth(freshCredentials, response));
			const received = await historian.getRefs();
			assert.deepStrictEqual(received, response);
		});
	});

	describe("getRef", () => {
		const url = getUrlWithToken(`/git/refs/${ref}`, initialCredentials);
		const response = mockRef;
		it("succeeds on 200", async () => {
			axiosMock.onGet(url).reply(mockReplyWithAuth(initialCredentials, response));
			const received = await historian.getRef(ref);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			axiosMock.onGet(url).reply(mockReplyWithAuth(freshCredentials, response));
			const received = await historian.getRef(ref);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("createRef", () => {
		const refParams: git.ICreateRefParams = {
			ref,
			sha,
		};
		const url = getUrlWithToken(`/git/refs`, initialCredentials);
		const response = mockRef;
		it("succeeds on 200", async () => {
			axiosMock.onPost(url, refParams).reply(mockReplyWithAuth(initialCredentials, response));
			const received = await historian.createRef(refParams);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			axiosMock.onPost(url, refParams).reply(mockReplyWithAuth(freshCredentials, response));
			const received = await historian.createRef(refParams);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("updateRef", () => {
		const refParams: git.IPatchRefParams = {
			sha,
			force: true,
		};
		const url = getUrlWithToken(`/git/refs/${ref}`, initialCredentials);
		const response = {
			"Content-Type": "text",
		};
		it("succeeds on 200", async () => {
			axiosMock.onPatch(url).reply(mockReplyWithAuth(initialCredentials, response));
			const received = await historian.updateRef(ref, refParams);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			axiosMock.onPatch(url).reply(mockReplyWithAuth(freshCredentials, response));
			const received = await historian.updateRef(ref, refParams);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("deleteRef", () => {
		const url = getUrlWithToken(`/git/refs/${ref}`, initialCredentials);
		const response = {
			"Content-Type": "text",
		};
		it("succeeds on 200", async () => {
			axiosMock.onDelete(url).reply(mockReplyWithAuth(initialCredentials, response));
			await assert.doesNotReject(historian.deleteRef(ref));
		});
		it("retries once with new credentials on 401", async () => {
			axiosMock.onDelete(url).reply(mockReplyWithAuth(freshCredentials, response));
			await assert.doesNotReject(historian.deleteRef(ref));
		});
	});

	describe("createTag", () => {
		const tagParams: git.ICreateTagParams = {
			tag,
			message: mockTag.message,
			object: JSON.stringify(mockTag.object),
			type: mockTag.object.type,
			tagger: mockTag.tagger,
		};
		const url = getUrlWithToken(`/git/tags`, initialCredentials);
		const response = mockTag;
		it("succeeds on 200", async () => {
			axiosMock.onPost(url, tagParams).reply(mockReplyWithAuth(initialCredentials, response));
			const received = await historian.createTag(tagParams);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			axiosMock.onPost(url, tagParams).reply(mockReplyWithAuth(freshCredentials, response));
			const received = await historian.createTag(tagParams);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("getTag", () => {
		const url = getUrlWithToken(`/git/tags/${tag}`, initialCredentials);
		const response = mockTag;
		it("succeeds on 200", async () => {
			axiosMock.onGet(url).reply(mockReplyWithAuth(initialCredentials, response));
			const received = await historian.getTag(tag);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			axiosMock.onGet(url).reply(mockReplyWithAuth(freshCredentials, response));
			const received = await historian.getTag(tag);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("createTree", () => {
		const treeParams: git.ICreateTreeParams = {
			tree: mockTree.tree,
		};
		const url = getUrlWithToken(`/git/trees`, initialCredentials);
		const response = mockTree;
		it("succeeds on 200", async () => {
			axiosMock
				.onPost(url, treeParams)
				.reply(mockReplyWithAuth(initialCredentials, response));
			const received = await historian.createTree(treeParams);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			axiosMock.onPost(url, treeParams).reply(mockReplyWithAuth(freshCredentials, response));
			const received = await historian.createTree(treeParams);
			assert.deepStrictEqual(received, response);
		});
	});

	describe("getTree", () => {
		const url = getUrlWithToken(`/git/trees/${encodeURIComponent(sha)}`, initialCredentials, {
			recursive: 1,
		});
		const response = mockTree;
		it("succeeds on 200", async () => {
			axiosMock.onGet(url).reply(mockReplyWithAuth(initialCredentials, response));
			const received = await historian.getTree(sha, true);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			axiosMock.onGet(url).reply(mockReplyWithAuth(freshCredentials, response));
			const received = await historian.getTree(sha, true);
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
		const url = getUrlWithToken(`/git/summaries`, initialCredentials);
		const response = mockSummaryWriteResponse;
		it("succeeds on 200", async () => {
			axiosMock
				.onPost(url, summaryPayload)
				.reply(mockReplyWithAuth(initialCredentials, response));
			const received = await historian.createSummary(summaryPayload);
			assert.deepStrictEqual(received, response);
		});
		it("succeeds with initial=true query param", async () => {
			const initialUrl = getUrlWithToken(`/git/summaries`, initialCredentials, {
				initial: true,
			});
			axiosMock
				.onPost(initialUrl, summaryPayload)
				.reply(mockReplyWithAuth(initialCredentials, response));
			const received = await historian.createSummary(summaryPayload, true);
			assert.deepStrictEqual(received, response);
		});
		it("succeeds with initial=false query param", async () => {
			const initialUrl = getUrlWithToken(`/git/summaries`, initialCredentials, {
				initial: false,
			});
			axiosMock
				.onPost(initialUrl, summaryPayload)
				.reply(mockReplyWithAuth(initialCredentials, response));
			const received = await historian.createSummary(summaryPayload, false);
			assert.deepStrictEqual(received, response);
		});
		it("retries once with new credentials on 401", async () => {
			axiosMock
				.onPost(url, summaryPayload)
				.reply(mockReplyWithAuth(freshCredentials, response));
			const received = await historian.createSummary(summaryPayload);
			assert.deepStrictEqual(received, response);
		});
	});
});

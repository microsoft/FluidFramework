/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "chai";
import { detectVersionScheme } from "../schemes";
import { bumpRange } from "../semver";
import { parseWorkspaceProtocol } from "../workspace";

describe("parseWorkspaceProtocol", () => {
	it("workspace:*", () => {
		const input = `workspace:*`;
		const expected = `*`;
		const [isWorkspace, result] = parseWorkspaceProtocol(input);
		assert.isTrue(isWorkspace);
		assert.strictEqual(result, expected);
	});

	it("workspace:^", () => {
		const input = `workspace:^`;
		const expected = `^`;
		const [isWorkspace, result] = parseWorkspaceProtocol(input);
		assert.isTrue(isWorkspace);
		assert.strictEqual(result, expected);
	});

	it("workspace:~", () => {
		const input = `workspace:~`;
		const expected = `~`;
		const [isWorkspace, result] = parseWorkspaceProtocol(input);
		assert.isTrue(isWorkspace);
		assert.strictEqual(result, expected);
	});

	it("workspace:1.2.3", () => {
		const input = `workspace:1.2.3`;
		const expected = `1.2.3`;
		const [isWorkspace, result] = parseWorkspaceProtocol(input);
		assert.isTrue(isWorkspace);
		assert.strictEqual(result, expected);
	});

	it("workspace:~1.2.3", () => {
		const input = `workspace:~1.2.3`;
		const expected = `~1.2.3`;
		const [isWorkspace, result] = parseWorkspaceProtocol(input);
		assert.isTrue(isWorkspace);
		assert.strictEqual(result, expected);
	});

	it("workspace:^1.2.3", () => {
		const input = `workspace:^1.2.3`;
		const expected = `^1.2.3`;
		const [isWorkspace, result] = parseWorkspaceProtocol(input);
		assert.isTrue(isWorkspace);
		assert.strictEqual(result, expected);
	});
});

describe("workspace protocol; constraint only", () => {
	it("bump star constraint", () => {
		const input = `workspace:*`;
		const expected = `workspace:*`;
		const result = bumpRange(input, "patch");
		assert.strictEqual(result, expected);
	});

	it("bump caret constraint", () => {
		const input = `workspace:^`;
		const expected = `workspace:^`;
		const result = bumpRange(input, "patch");
		assert.strictEqual(result, expected);
	});

	it("bump tilde constraint", () => {
		const input = `workspace:~`;
		const expected = `workspace:~`;
		const result = bumpRange(input, "patch");
		assert.strictEqual(result, expected);
	});
});

describe("workspace protocol; internal version scheme", () => {
	it("bump patch", () => {
		const input = `workspace:2.0.0-internal.1.1.0`;
		const expected = `workspace:2.0.0-internal.1.1.1`;
		const result = bumpRange(input, "patch");
		assert.strictEqual(result, expected);
	});

	it("bump minor", () => {
		const input = `workspace:2.0.0-internal.1.0.1`;
		const expected = `workspace:2.0.0-internal.1.1.0`;
		const result = bumpRange(input, "minor");
		assert.strictEqual(result, expected);
	});

	it("bump minor with patch constraint", () => {
		const input = `workspace:~2.0.0-internal.1.0.1`;
		const expected = `workspace:~2.0.0-internal.1.1.0`;
		const result = bumpRange(input, "minor");
		assert.strictEqual(result, expected);
	});

	it("bump minor with minor constraint", () => {
		const input = `workspace:^2.0.0-internal.1.0.1`;
		const expected = `workspace:^2.0.0-internal.1.1.0`;
		const result = bumpRange(input, "minor");
		assert.strictEqual(result, expected);
	});

	it("bump major with patch constraint", () => {
		const input = `workspace:~2.0.0-internal.1.0.1`;
		const expected = `workspace:~2.0.0-internal.2.0.0`;
		const result = bumpRange(input, "major");
		assert.strictEqual(result, expected);
	});

	it("bump major with minor constraint", () => {
		const input = `workspace:^2.0.0-internal.1.0.1`;
		const expected = `workspace:^2.0.0-internal.2.0.0`;
		const result = bumpRange(input, "major");
		assert.strictEqual(result, expected);
	});
});

describe("workspace protocol; virtualPatch scheme", () => {
	it("bumps 0.59.3002 major using virtualPatch scheme", () => {
		const input = `workspace:0.59.3002`;
		const expected = `workspace:0.60.1000`;
		const calculated = bumpRange(input, "major");
		assert.strictEqual(calculated, expected);
	});

	it("bumps 0.58.1002 minor using virtualPatch scheme", () => {
		const input = `workspace:0.58.1002`;
		const expected = `workspace:0.58.2000`;
		const calculated = bumpRange(input, "minor");
		assert.strictEqual(calculated, expected);
	});

	it("bumps 0.58.1002 patch using virtualPatch scheme", () => {
		const input = `workspace:0.58.1002`;
		const expected = `workspace:0.58.1003`;
		const calculated = bumpRange(input, "patch");
		assert.strictEqual(calculated, expected);
	});

	it("bumps 0.58.2000 minor using virtualPatch scheme", () => {
		const input = `workspace:0.58.2000`;
		const expected = `workspace:0.58.3000`;
		const calculated = bumpRange(input, "minor");
		assert.strictEqual(calculated, expected);
	});
});

describe("workspace protocol; semver scheme ranges", () => {
	describe("precise version", () => {
		it("bump patch", () => {
			const input = `workspace:2.4.3`;
			const expected = `workspace:2.4.4`;
			const result = bumpRange(input, "patch");
			assert.strictEqual(result, expected);
		});

		it("bump minor", () => {
			const input = `workspace:2.4.3`;
			const expected = `workspace:2.5.0`;
			const result = bumpRange(input, "minor");
			assert.strictEqual(result, expected);
		});

		it("bump major", () => {
			const input = `workspace:2.4.3`;
			const expected = `workspace:3.0.0`;
			const result = bumpRange(input, "major");
			assert.strictEqual(result, expected);
		});

		it("bump current", () => {
			const input = `workspace:2.4.3`;
			const expected = `workspace:2.4.3`;
			const result = bumpRange(input, "current");
			assert.strictEqual(result, expected);
		});

		it("bump patch prerelease", () => {
			const input = `workspace:2.4.3`;
			const expected = `workspace:2.4.4-0`;
			const result = bumpRange(input, "patch", true);
			assert.strictEqual(result, expected);
		});

		it("bump minor prerelease", () => {
			const input = `workspace:2.4.3`;
			const expected = `workspace:2.5.0-0`;
			const result = bumpRange(input, "minor", true);
			assert.strictEqual(result, expected);
		});

		it("bump major prerelease", () => {
			const input = `workspace:2.4.3`;
			const expected = `workspace:3.0.0-0`;
			const result = bumpRange(input, "major", true);
			assert.strictEqual(result, expected);
		});

		it("bump current prerelease", () => {
			const input = `workspace:2.4.3`;
			const expected = `workspace:2.4.3-0`;
			const result = bumpRange(input, "current", true);
			assert.strictEqual(result, expected);
		});

		it("bump prerelease to current", () => {
			const input = `workspace:2.4.3-0`;
			const expected = `workspace:2.4.3`;
			const result = bumpRange(input, "current", false);
			assert.strictEqual(result, expected);
		});

		it("bump prerelease to current prerelease (no-op)", () => {
			const input = `workspace:2.4.3-0`;
			const expected = `workspace:2.4.3-0`;
			const result = bumpRange(input, "current", true);
			assert.strictEqual(result, expected);
		});
	});

	describe("caret", () => {
		it("bump patch", () => {
			const input = `workspace:^2.4.3`;
			const expected = `workspace:^2.4.4`;
			const result = bumpRange(input, "patch");
			assert.strictEqual(result, expected);
		});

		it("bump minor", () => {
			const input = `workspace:^2.4.3`;
			const expected = `workspace:^2.5.0`;
			const result = bumpRange(input, "minor");
			assert.strictEqual(result, expected);
		});

		it("bump major", () => {
			const input = `workspace:^2.4.3`;
			const expected = `workspace:^3.0.0`;
			const result = bumpRange(input, "major");
			assert.strictEqual(result, expected);
		});

		it("bump current", () => {
			const input = `workspace:^2.4.3`;
			const expected = `workspace:^2.4.3`;
			const result = bumpRange(input, "current");
			assert.strictEqual(result, expected);
		});

		it("bump patch prerelease", () => {
			const input = `workspace:^2.4.3`;
			const expected = `workspace:^2.4.4-0`;
			const result = bumpRange(input, "patch", true);
			assert.strictEqual(result, expected);
		});

		it("bump minor prerelease", () => {
			const input = `workspace:^2.4.3`;
			const expected = `workspace:^2.5.0-0`;
			const result = bumpRange(input, "minor", true);
			assert.strictEqual(result, expected);
		});

		it("bump major prerelease", () => {
			const input = `workspace:^2.4.3`;
			const expected = `workspace:^3.0.0-0`;
			const result = bumpRange(input, "major", true);
			assert.strictEqual(result, expected);
		});

		it("bump current prerelease", () => {
			const input = `workspace:^2.4.3`;
			const expected = `workspace:^2.4.3-0`;
			const result = bumpRange(input, "current", true);
			assert.strictEqual(result, expected);
		});

		it("bump prerelease to current", () => {
			const input = `workspace:^2.4.3-0`;
			const expected = `workspace:^2.4.3`;
			const result = bumpRange(input, "current", false);
			assert.strictEqual(result, expected);
		});

		it("bump prerelease to current prerelease (no-op)", () => {
			const input = `workspace:^2.4.3-0`;
			const expected = `workspace:^2.4.3-0`;
			const result = bumpRange(input, "current", true);
			assert.strictEqual(result, expected);
		});
	});

	describe("tilde", () => {
		it("bump patch", () => {
			const input = `workspace:~2.4.3`;
			const expected = `workspace:~2.4.4`;
			const result = bumpRange(input, "patch");
			assert.strictEqual(result, expected);
		});

		it("bump minor", () => {
			const input = `workspace:~2.4.3`;
			const expected = `workspace:~2.5.0`;
			const result = bumpRange(input, "minor");
			assert.strictEqual(result, expected);
		});

		it("bump major", () => {
			const input = `workspace:~2.4.3`;
			const expected = `workspace:~3.0.0`;
			const result = bumpRange(input, "major");
			assert.strictEqual(result, expected);
		});

		it("bump patch prerelease", () => {
			const input = `workspace:~2.4.3`;
			const expected = `workspace:~2.4.4-0`;
			const result = bumpRange(input, "patch", true);
			assert.strictEqual(result, expected);
		});

		it("bump minor prerelease", () => {
			const input = `workspace:~2.4.3`;
			const expected = `workspace:~2.5.0-0`;
			const result = bumpRange(input, "minor", true);
			assert.strictEqual(result, expected);
		});

		it("bump major prerelease", () => {
			const input = `workspace:~2.4.3`;
			const expected = `workspace:~3.0.0-0`;
			const result = bumpRange(input, "major", true);
			assert.strictEqual(result, expected);
		});

		it("bump current prerelease", () => {
			const input = `workspace:~2.4.3`;
			const expected = `workspace:~2.4.3-0`;
			const result = bumpRange(input, "current", true);
			assert.strictEqual(result, expected);
		});

		it("bump prerelease to current", () => {
			const input = `workspace:~2.4.3-0`;
			const expected = `workspace:~2.4.3`;
			const result = bumpRange(input, "current", false);
			assert.strictEqual(result, expected);
		});

		it("bump prerelease to current prerelease (no-op)", () => {
			const input = `workspace:~2.4.3-0`;
			const expected = `workspace:~2.4.3-0`;
			const result = bumpRange(input, "current", true);
			assert.strictEqual(result, expected);
		});

		it("pre-1.0 semver", () => {
			const input = `workspace:^0.14.0`;
			const expected = `workspace:^0.15.0`;
			const result = bumpRange(input, "minor", false);
			assert.strictEqual(result, expected);
		});
	});
});

describe("workspace protocol; detectVersionScheme", () => {
	it("detects workspace:2.0.0-internal.1.0.0 is internal", () => {
		const input = `workspace:2.0.0-internal.1.0.0`;
		const expected = "internal";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects workspace:2.0.0-internal.1.1.0 is internal", () => {
		const input = `workspace:2.0.0-internal.1.1.0`;
		const expected = "internal";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects workspace:2.0.0-internal.1.0.0.85674 is internalPrerelease", () => {
		const input = `workspace:2.0.0-internal.1.0.0.85674`;
		const expected = "internalPrerelease";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects workspace:2.0.0-dev.3.0.0.105091 is internalPrerelease", () => {
		const input = `workspace:2.0.0-dev.3.0.0.105091`;
		const expected = "internalPrerelease";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects workspace:>=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0 is internal", () => {
		const input = `workspace:>=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0`;
		const expected = "internal";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects workspace:^2.0.0-internal.1.0.0 is internal", () => {
		const input = `workspace:^2.0.0-internal.1.0.0`;
		const expected = "internal";
		assert.strictEqual(detectVersionScheme(input), expected);
	});

	it("detects workspace:~2.0.0-internal.1.0.0 is internal", () => {
		const input = `workspace:~2.0.0-internal.1.0.0`;
		const expected = "internal";
		assert.strictEqual(detectVersionScheme(input), expected);
	});
});

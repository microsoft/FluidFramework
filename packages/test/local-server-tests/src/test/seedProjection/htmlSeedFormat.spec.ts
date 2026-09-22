/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { parseHtml, serializeHtml } from "./htmlSeedFormat.js";
import { buildNativeBaseline } from "./nativeSeedBaseline.js";

// Validate the pure application format and deterministic native materialization without a live service.
describe("Seed projection reference: format and baseline", () => {
	// Canonical bytes must preserve semantic content and stabilize after the first parse/serialize cycle.
	it("canonicalizes attributes/entities without losing ordered children or text", () => {
		const input =
			'<div title="A &amp; B" class="x"><p>one<strong>two</strong>three<br></p></div>';
		const canonical = serializeHtml(parseHtml(input));
		assert.equal(
			canonical,
			'<div class="x" title="A &amp; B"><p>one<strong>two</strong>three<br></p></div>',
		);
		assert.equal(serializeHtml(parseHtml(canonical)), canonical);
	});

	for (const invalid of [
		"<script>x</script>",
		"<DIV></DIV>",
		"<p>",
		"<p></div>",
		"<!--x-->",
		'<p onclick="x"></p>',
		'<p id="a" id="b"></p>',
		"<p title=x></p>",
		"<p>&unknown;</p>",
		"<img>",
		"<p><br/></p>",
		"<p>\u0000</p>",
		"<p>\uD800</p>",
	]) {
		// Reject input outside the versioned grammar rather than guessing a browser-style repair.
		it(`rejects unsupported input ${JSON.stringify(invalid)}`, () => {
			assert.throws(() => parseHtml(invalid));
		});
	}

	// Equivalent HTML must produce identical persistent identities/bytes, not merely equal rendered text.
	it("independently constructs byte-identical native baselines and identity tables", () => {
		const a = buildNativeBaseline('<p title="x" id="a">hello</p>', 0);
		const b = buildNativeBaseline('<p id="a" title="x">hello</p>', 0);
		assert.equal(a.fingerprint, b.fingerprint);
		assert.deepEqual(a.summary, b.summary);
		assert.deepEqual(a.blobs, b.blobs);
		assert.notEqual(a, b);
		assert.match(a.fingerprint, /^[0-9a-f]{64}$/u);
	});

	// Native edits can exceed the HTML language even when the SharedTree structural schema accepts them.
	it("rejects unsupported native edits instead of publishing or silently dropping them", () => {
		assert.throws(() => serializeHtml([{ tag: "script", attributes: {}, children: [] }]));
		assert.throws(() =>
			serializeHtml([{ tag: "p", attributes: { onclick: "x" }, children: [] }]),
		);
		assert.throws(() =>
			serializeHtml([{ tag: "br", attributes: {}, children: [{ text: "lost" }] }]),
		);
	});

	for (const name of [
		'title="injected" data-x',
		"title other",
		"data-X",
		"data-",
		"title\n",
		"onclick",
	]) {
		// Validate each native name before interpolation so it cannot become different, otherwise valid markup.
		it(`rejects invalid native attribute names before serialization: ${JSON.stringify(name)}`, () => {
			assert.throws(
				() => serializeHtml([{ tag: "p", attributes: { [name]: "value" }, children: [] }]),
				/Unsupported attribute name/,
			);
		});
	}
});

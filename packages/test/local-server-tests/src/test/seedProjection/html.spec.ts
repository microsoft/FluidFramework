/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { buildNativeBaseline } from "./baseline.js";
import { parseHtml, serializeHtml } from "./html.js";

describe("Seed projection reference: format and baseline", () => {
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
		"<p>\ud800</p>",
	]) {
		it(`rejects unsupported input ${JSON.stringify(invalid)}`, () => {
			assert.throws(() => parseHtml(invalid));
		});
	}

	it("independently constructs byte-identical native baselines and identity tables", () => {
		const a = buildNativeBaseline('<p title="x" id="a">hello</p>', 0);
		const b = buildNativeBaseline('<p id="a" title="x">hello</p>', 0);
		assert.equal(a.fingerprint, b.fingerprint);
		assert.deepEqual(a.summary, b.summary);
		assert.deepEqual(a.blobs, b.blobs);
		assert.notEqual(a, b);
	});

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
		it(`rejects invalid native attribute names before serialization: ${JSON.stringify(name)}`, () => {
			assert.throws(
				() => serializeHtml([{ tag: "p", attributes: { [name]: "value" }, children: [] }]),
				/Unsupported attribute name/,
			);
		});
	}
});

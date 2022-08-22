/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { benchmark, BenchmarkType, isInPerformanceTestingMode } from "@fluid-tools/benchmark";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { makeRandom, PerformanceMarkovChain, SpaceEfficientMarkovChain } from "@fluid-internal/stochastic-test-utils";
import { buildForest, ITreeCursor, jsonableTreeFromCursor, singleTextCursor } from "../../..";
import { initializeForest, TreeNavigationResult } from "../../../forest";
// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { cursorToJsonObject, JsonCursor } from "../../../domains/json/jsonCursor";
import { generateCanada } from "./canada";
import { generateTwitterJsonByByteSize, getTwitterJsonTextFieldMarkovChain,
     parseSentencesIntoWords,
     parseTwitterJsonIntoSentences, TwitterJson, twitterRawJson } from "./twitter";
import { getSizeInBytes } from "./jsonGeneratorUtils";

// IIRC, extracting this helper from clone() encourages V8 to inline the terminal case at
// the leaves, but this should be verified.
function cloneObject<T, J = Jsonable<T>>(obj: J): J {
    if (Array.isArray(obj)) {
        // PERF: 'Array.map()' was ~44% faster than looping over the array. (node 14 x64)
        return obj.map(clone) as unknown as J;
    } else {
        const result: any = {};
        // PERF: Nested array allocs make 'Object.entries()' ~2.4x slower than reading
        //       value via 'value[key]', even when destructuring. (node 14 x64)
        for (const key of Object.keys(obj)) {
            result[key] = clone((obj as any)[key]);
        }
        return result as J;
    }
}

// Optimized deep clone implementation for "Jsonable" object trees.  Used as a real-world-ish
// baseline to measure the overhead of using ITreeCursor in a scenario where we're reifying a
// domain model for the application.
function clone<T>(value: Jsonable<T>): Jsonable<T> {
    // PERF: Separate clone vs. cloneObject yields an ~11% speedup in 'canada.json',
    //       likely due to inlining short-circuiting recursing at leaves (node 14 x64).
    return typeof value !== "object" || value === null
        ? value
        : cloneObject(value);
}

// Helper that measures an optimized 'deepClone()' vs. using ITreeCursor to extract an
// equivalent clone of the source data.
function bench(name: string, getJson: () => any) {
    const json = getJson();
    const encodedTree = jsonableTreeFromCursor(new JsonCursor(json));

    benchmark({
        type: BenchmarkType.Measurement,
        title: `Direct: '${name}'`,
        before: () => {
            const cloned = clone(json);
            assert.deepEqual(cloned, json,
                "clone() must return an equivalent tree.");
            assert.notEqual(cloned, json,
                "clone() must not return the same tree instance.");
        },
        benchmarkFn: () => {
            clone(json);
        },
    });

    const cursorFactories: [string, () => ITreeCursor][] = [
        ["JsonCursor", () => new JsonCursor(json)],
        ["TextCursor", () => singleTextCursor(encodedTree)],
        ["object-forest Cursor", () => {
            const forest = buildForest();
            initializeForest(forest, [encodedTree]);
            const cursor = forest.allocateCursor();
            assert.equal(forest.tryMoveCursorTo(forest.root(forest.rootField), cursor), TreeNavigationResult.Ok);
            return cursor;
        }],
    ];

    const consumers: [string, (cursor: ITreeCursor) => void][] = [
        ["cursorToJsonObject", cursorToJsonObject],
        ["jsonableTreeFromCursor", jsonableTreeFromCursor],
    ];

    for (const [consumerName, consumer] of consumers) {
        for (const [factoryName, factory] of cursorFactories) {
            let cursor: ITreeCursor;
            benchmark({
                type: BenchmarkType.Measurement,
                title: `${consumerName}(${factoryName}): '${name}'`,
                before: () => {
                    cursor = factory();
                    assert.deepEqual(cursorToJsonObject(cursor), json, "data should round trip through json");
                    assert.deepEqual(
                        jsonableTreeFromCursor(cursor), encodedTree, "data should round trip through jsonable");
                },
                benchmarkFn: () => {
                    consumer(cursor);
                },
            });
        }
    }
}

const canada = generateCanada(
    // Use the default (large) data set for benchmarking, otherwise use a small dataset.
    isInPerformanceTestingMode
        ? undefined
        : [2, 10]);

// The original benchmark twitter.json is 466906 Bytes according to getSizeInBytes.
const twitter = generateTwitterJsonByByteSize(isInPerformanceTestingMode ? 2500000 : 466906, true, true);
describe("ITreeCursor", () => {
    // const sentences = [
    //     ["hello", "my", "freind"],
    //     ["hello", "my", "friend", "daniel"],
    //     ["hello", "you", "my", "friend"],
    // ];

    // const chain = markovChainBuilder(sentences);
    // const sentence = buildTextFromMarkovChain(chain, makeRandom(), 4);

    const originalTwitterBenchmarkJson: TwitterJson = twitterRawJson();

    const textFieldSentences: string[] = [];
    let maxTextFieldLength = 0;
    const userDescriptionFieldSentences: string[] = [];
    let maxUserDescFieldLength = 0;
    originalTwitterBenchmarkJson.statuses.forEach((tweet) => {
        textFieldSentences.push(tweet.text);
        maxTextFieldLength = Math.max(maxTextFieldLength, tweet.text.length);
        userDescriptionFieldSentences.push(tweet.user.description);
        maxUserDescFieldLength = Math.max(maxUserDescFieldLength, tweet.user.description.length);
        if (tweet.retweeted_status) {
            textFieldSentences.push(tweet.retweeted_status.text);
            maxTextFieldLength = Math.max(maxTextFieldLength, tweet.retweeted_status.text.length);
            userDescriptionFieldSentences.push(tweet.retweeted_status.user.description);
            maxUserDescFieldLength = Math.max(maxUserDescFieldLength, tweet.retweeted_status.user.description.length);
        }
    });

    const textFieldParsedSentences = parseSentencesIntoWords(textFieldSentences);
    const userDescriptionFieldParsedSentences = parseSentencesIntoWords(userDescriptionFieldSentences);

    // example of producing a performance efficient markov chain
    const textFieldPerformanceMarkovChain = new PerformanceMarkovChain(makeRandom());
    console.time("performanceMarkovChain.initialize()");
    textFieldPerformanceMarkovChain.initialize(textFieldParsedSentences);
    console.timeEnd("performanceMarkovChain.initialize()");
    console.time("performanceMarkovChain.generateSentence()");
    const textFieldGeneratedSentence1 = textFieldPerformanceMarkovChain.generateSentence(maxTextFieldLength);
    console.timeEnd("performanceMarkovChain.generateSentence()");
    const performanceMarkovChainSize = getSizeInBytes(textFieldPerformanceMarkovChain.chain);
    const perfKeyLen = Object.keys(textFieldPerformanceMarkovChain.chain).length;

    // example of producing a space efficient markov chain based on the text field
    const textFieldSpaceEffChain = new SpaceEfficientMarkovChain(makeRandom());
    console.time("textFieldSpaceEffChain.initialize()");
    textFieldSpaceEffChain.initialize(textFieldParsedSentences);
    console.timeEnd("textFieldSpaceEffChain.initialize()");
    console.time("textFieldSpaceEffChain.generateSentence()");
    const textFieldGeneratedSentence2 = textFieldSpaceEffChain.generateSentence(maxTextFieldLength);
    console.timeEnd("textFieldSpaceEffChain.generateSentence()");
    const textFieldSpaceEffMarkovChainSize = getSizeInBytes(textFieldSpaceEffChain.chain);
    const spaceEffKeyLen = Object.keys(textFieldSpaceEffChain.chain).length;
    const textFieldStringifiedChain = JSON.stringify(textFieldSpaceEffChain.chain);

    // example of producing a space efficient markov chain based on the user.description field
    const userDescFieldSpaceEffChain = new SpaceEfficientMarkovChain(makeRandom());
    console.time("userDescFieldSpaceEffChain.initialize()");
    userDescFieldSpaceEffChain.initialize(userDescriptionFieldParsedSentences);
    console.timeEnd("userDescFieldSpaceEffChain.initialize()");
    console.time("userDescFieldSpaceEffChain.generateSentence()");
    const userDescFieldGeneratedSentence1 =
    userDescFieldSpaceEffChain.generateSentence(maxUserDescFieldLength);
    console.timeEnd("userDescFieldSpaceEffChain.generateSentence()");
    const userDescFieldSpaceEffMarkovChainSize = getSizeInBytes(userDescFieldSpaceEffChain.chain);
    const userDescSpaceEffKeyLen = Object.keys(userDescFieldSpaceEffChain.chain).length;
    const descriptionFieldStringifiedChain = JSON.stringify(userDescFieldSpaceEffChain.chain);

    // example of producting a markov chain class instance from a precomputed markov chain.
    const textFieldChainFromString =
     new SpaceEfficientMarkovChain(makeRandom(), getTwitterJsonTextFieldMarkovChain());
    const userDescChainFromString =
    new SpaceEfficientMarkovChain(makeRandom(), JSON.parse(descriptionFieldStringifiedChain));
    const textFieldGeneratedSentence3 = textFieldChainFromString.generateSentence(maxTextFieldLength);
    const userDescFieldGeneratedSentence2 = userDescChainFromString.generateSentence(maxUserDescFieldLength);

    bench("canada", () => canada);
    bench("twitter", () => twitter);
});

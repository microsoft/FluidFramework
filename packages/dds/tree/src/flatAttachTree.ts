/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Allows multiple marks to compete for the same relative sibling.
 * The race is represented as an array of ranked lanes where all of the content in the lane i (race[i])
 * should appear before all of the contents in lane k for i < k.
 * ============
 *  A
 *  +-B
 *    +-C
 * [A<B<C]
 * ============
 *      C
 *    B-+
 *  A-+
 * [A>B>C]
 * ============
 *  A
 *  +-B <- 1st insert
 *  +-C <- 2nd insert
 * [A
 *   {
 *     <
 *     [<B]
 *     [<C]
 *   }
 * ]
 * ============
 *   C
 * A-+ <- 1st insert
 * B-+ <- 2nd insert
 * [
 *   {
 *     >
 *     [A>]
 *     [B>]
 *   }
 * C]
 * ============
 * A     D
 * +---C
 *   B-+
 * [A
 *   {
 *     <
 *     [B>]
 *     [<C]
 *   }
 * D]
 * ============
 * A     D
 *   B---+
 *   +-B
 * [A
 *   {
 *     >
 *     [B>]
 *     [<C]
 *   }
 * D]
 * ============
 * A       E
 * +---C
 *   B-+-D
 * [A
 *   {
 *     <
 *     [B>]
 *     [<C <D]
 *   }
 * E]
 * ============
 * A       E
 *     C---+
 *   B-+-D
 * [A
 *   {
 *     >
 *     [B> C>]
 *     [<D]
 *   }
 * E]
 * ============
 * This information is needed in original changes to produce a merge outcome with the correct ordering
 * of the entries in the race vs other entries in concurrent edits targeting the same index and sibling.
 * For example if the original edit includes the insertion of:
 * - node X before A with tiebreak LastToFirst
 * - node Z before A with tiebreak FirstToLast
 * And a concurrent edit inserts:
 * - node Y before B
 * Then we know that the outcome should be X Y Z B.
 * Had the inserts for X and Y been represented as adjacent outside a Race then it would have
 * looked as though X had been inserted relative to Z. Since Z belongs after Y in the merge then
 * X would have landed right before Z yielding Y X Z B.
 */

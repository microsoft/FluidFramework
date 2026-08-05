/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Minimal React type definitions used in this package's public API.
 *
 * @remarks
 * This package works with both React 18 and React 19. To avoid leaking version-specific React types
 * (from `@types/react`) into its public API, the small subset of React's types that appears in
 * exported signatures is defined here instead. These are intentionally minimal but structurally
 * compatible with the corresponding React types in both versions.
 */

/**
 * Minimal stand-in for React's `ReactElement` — the result of evaluating a JSX expression.
 * @remarks
 * `type` and `props` are `any` (rather than `unknown`) intentionally: React's own `ReactElement`
 * constrains `type` to `string | JSXElementConstructor<...>`, so `any` is what makes this minimal
 * element mutually assignable with React's element in both the produce (render) and consume
 * directions, for both React 18 and React 19.
 * @alpha @sealed
 */
export interface ReactElement {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- required for mutual compatibility with React's ReactElement (see remarks).
	readonly type: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- required for mutual compatibility with React's ReactElement (see remarks).
	readonly props: any;
	// eslint-disable-next-line @rushstack/no-new-null -- matches React's `ReactElement.key` (`string | null`).
	readonly key: string | null;
}

/**
 * Minimal stand-in for React's `FunctionComponent` (`FC`) — a function from props to renderable output.
 * @privateRemarks
 * For simplicity, this type only models the function signature from props to a ReactElement,
 * without any of the additional properties that React's `FC` type has (like `defaultProps`, `propTypes`, or `displayName`),
 * or the extra allowed returns types of ReactNode.
 * @alpha
 */
export type FC<in P = object> = (props: P) => ReactElement;

/**
 * Comparator for a memoized component's props: returns `true` when the props are considered equal
 * (a stand-in for the second parameter of React's `memo`).
 * @alpha @sealed
 */
export type PropsAreEqual<P> = (previous: Readonly<P>, next: Readonly<P>) => boolean;

/**
 * A memoized component (a stand-in for React's `MemoExoticComponent`).
 * @remarks
 * Modeled minimally as a component with the same props as the component it wraps, which is all that
 * is needed to render it.
 * @alpha @sealed
 */
export type MemoExoticComponent<T extends FC<never>> = FC<Parameters<T>[0]>;

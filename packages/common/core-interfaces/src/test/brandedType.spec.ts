/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BrandedType } from "@fluidframework/core-interfaces/internal";

import { createInstanceOf } from "./testUtils.js";
import type { BrandedString } from "./testValues.js";
import {
	brandedNumber,
	brandedString,
	brandedObject,
	brandedObjectWithString,
} from "./testValues.js";

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- incorrect rule: misunderstands `declare`d types.

function parameterAcceptedAs<T>(_t: T): void {
	// Do nothing.  Used to verify type compatibility.
}

declare class BivariantBrand<const T> extends BrandedType<BivariantBrand<unknown>> {
	// This "abuses" function parameter bivariance to make the brand bivariant
	// over T while respecting unrelated types are not compatible.
	protected BivariantBrand(_: T): void;
	private constructor();
}

declare class CovariantBrand<const out T> extends BrandedType<CovariantBrand<unknown>> {
	protected readonly CovariantBrand: T;
	private constructor();
}

declare class ContravariantBrand<const in T> extends BrandedType<ContravariantBrand<unknown>> {
	protected readonly ContravariantBrand: (_: T) => void;
	private constructor();
}

/**
 * This invariant brand is unrelated to the other example brands and thus should
 * not be compatible with them even when generic parameter T is the same.
 */
declare class InvariantBrand<const in out T> extends BrandedType<InvariantBrand<unknown>> {
	protected readonly InvariantBrand: (_: T) => T;
	private constructor();
}

/**
 * This invariant brand combines both covariant and contravariant properties
 * to ensure it is invariant in T. It is related to both CovariantBrand and
 * ContravariantBrand and thus should be compatible with them when generic
 * parameter T is the same or a subtype (for CovariantBrand) or supertype
 * (for ContravariantBrand).
 */
type InvariantBrandFromCoAndContraVariants<T> = CovariantBrand<T> & ContravariantBrand<T>;

/**
 * This looks just like {@link BivariantBrand} but is actually unique and
 * they are not interchangeable.
 */
declare class RedeclaredBivariantBrand<const T> extends BrandedType<BivariantBrand<unknown>> {
	protected BivariantBrand(_: T): void;
	private constructor();
}

declare class BrandUsingPrivateKey<
	const T,
> extends BrandedType<"Any Brand Using Private Key"> {
	private readonly Private: unknown;
	private constructor();
}

declare class AnotherBrandUsingPrivateKey<
	const T,
> extends BrandedType<"Any Brand Using Private Key"> {
	private readonly Private: unknown;
	private constructor();
}

// Test examples of poorly declared brands that do not distinguish - DO NOT USE this pattern
// Note that here the Brands given to BrandedType are effectively the same even though they
// appear different.
declare class UndistinguishedBrand<const T> extends BrandedType<
	UndistinguishedBrand<unknown>
> {
	public readonly Undistinguished: T;
	private constructor();
}
declare class AnotherUndistinguishedBrand<const T> extends BrandedType<
	AnotherUndistinguishedBrand<unknown>
> {
	public readonly Undistinguished: T;
	private constructor();
}

describe("BrandedType", () => {
	describe("derived brands can define their own compatibility", () => {
		it("`BivariantBrand<B>` is assignable to `BivariantBrand<A>` when `B` is a subtype of `A`", () => {
			parameterAcceptedAs<BivariantBrand<string>>(
				createInstanceOf<BivariantBrand<"literal">>(),
			);
			parameterAcceptedAs<BivariantBrand<number>>(createInstanceOf<BivariantBrand<5>>());
			parameterAcceptedAs<BivariantBrand<boolean>>(createInstanceOf<BivariantBrand<false>>());
		});

		it("`BivariantBrand<B>` is assignable to `BivariantBrand<A>` when `A` is a subtype of `B`", () => {
			parameterAcceptedAs<BivariantBrand<"literal">>(
				createInstanceOf<BivariantBrand<string>>(),
			);
			parameterAcceptedAs<BivariantBrand<5>>(createInstanceOf<BivariantBrand<number>>());
			parameterAcceptedAs<BivariantBrand<false>>(createInstanceOf<BivariantBrand<boolean>>());
		});

		it("`BivariantBrand<B>` is NOT assignable to `BivariantBrand<A>` when `B` is unrelated to `A`", () => {
			parameterAcceptedAs<BivariantBrand<string>>(
				// @ts-expect-error Type 'BivariantBrand<number>' is not assignable to type 'BivariantBrand<string>'
				createInstanceOf<BivariantBrand<number>>(),
			);
			parameterAcceptedAs<BivariantBrand<number>>(
				// @ts-expect-error Type 'BivariantBrand<boolean>' is not assignable to type 'BivariantBrand<number>'
				createInstanceOf<BivariantBrand<boolean>>(),
			);
			parameterAcceptedAs<BivariantBrand<boolean>>(
				// @ts-expect-error Type 'BivariantBrand<string>' is not assignable to type 'BivariantBrand<boolean>'
				createInstanceOf<BivariantBrand<string>>(),
			);
		});

		it("`CovariantBrand<B>` is assignable to `CovariantBrand<A>` when `B` is a subtype of `A`", () => {
			parameterAcceptedAs<CovariantBrand<string>>(
				createInstanceOf<CovariantBrand<"literal">>(),
			);
			parameterAcceptedAs<CovariantBrand<number>>(createInstanceOf<CovariantBrand<5>>());
			parameterAcceptedAs<CovariantBrand<boolean>>(createInstanceOf<CovariantBrand<false>>());
		});

		it("`CovariantBrand<B>` is NOT assignable to `CovariantBrand<A>` when `A` is a subtype of `B`", () => {
			parameterAcceptedAs<CovariantBrand<"literal">>(
				// @ts-expect-error Type 'CovariantBrand<string>' is not assignable to type 'CovariantBrand<"literal">'
				createInstanceOf<CovariantBrand<string>>(),
			);
			parameterAcceptedAs<CovariantBrand<5>>(
				// @ts-expect-error Type 'CovariantBrand<number>' is not assignable to type 'CovariantBrand<5>'
				createInstanceOf<CovariantBrand<number>>(),
			);
			parameterAcceptedAs<CovariantBrand<false>>(
				// @ts-expect-error Type 'CovariantBrand<boolean>' is not assignable to type 'CovariantBrand<false>'
				createInstanceOf<CovariantBrand<boolean>>(),
			);
		});

		it("`ContravariantBrand<B>` is NOT assignable to `ContravariantBrand<A>` when `B` is a subtype of `A`", () => {
			parameterAcceptedAs<ContravariantBrand<string>>(
				// @ts-expect-error Type 'ContravariantBrand<"literal">' is not assignable to type 'ContravariantBrand<string>'
				createInstanceOf<ContravariantBrand<"literal">>(),
			);
			parameterAcceptedAs<ContravariantBrand<number>>(
				// @ts-expect-error Type 'ContravariantBrand<5>' is not assignable to type 'ContravariantBrand<number>'
				createInstanceOf<ContravariantBrand<5>>(),
			);
			parameterAcceptedAs<ContravariantBrand<boolean>>(
				// @ts-expect-error Type 'ContravariantBrand<false>' is not assignable to type 'ContravariantBrand<boolean>'
				createInstanceOf<ContravariantBrand<false>>(),
			);
		});

		it("`ContravariantBrand<B>` is assignable to `ContravariantBrand<A>` when `A` is a subtype of `B`", () => {
			parameterAcceptedAs<ContravariantBrand<"literal">>(
				createInstanceOf<ContravariantBrand<string>>(),
			);
			parameterAcceptedAs<ContravariantBrand<5>>(
				createInstanceOf<ContravariantBrand<number>>(),
			);
			parameterAcceptedAs<ContravariantBrand<false>>(
				createInstanceOf<ContravariantBrand<boolean>>(),
			);
		});

		it("`InvariantBrand<B>` is NOT assignable to `InvariantBrand<A>` when `B` is a subtype of `A`", () => {
			parameterAcceptedAs<InvariantBrand<string>>(
				// @ts-expect-error Type 'InvariantBrand<"literal">' is not assignable to type 'InvariantBrand<string>'
				createInstanceOf<InvariantBrand<"literal">>(),
			);
			parameterAcceptedAs<InvariantBrand<number>>(
				// @ts-expect-error Type 'InvariantBrand<5>' is not assignable to type 'InvariantBrand<number>'
				createInstanceOf<InvariantBrand<5>>(),
			);
			parameterAcceptedAs<InvariantBrand<boolean>>(
				// @ts-expect-error Type 'InvariantBrand<false>' is not assignable to type 'InvariantBrand<boolean>'
				createInstanceOf<InvariantBrand<false>>(),
			);
		});

		it("`InvariantBrand<B>` is NOT assignable to `InvariantBrand<A>` when `A` is a subtype of `B`", () => {
			parameterAcceptedAs<InvariantBrand<"literal">>(
				// @ts-expect-error Type 'InvariantBrand<string>' is not assignable to type 'InvariantBrand<"literal">'
				createInstanceOf<InvariantBrand<string>>(),
			);
			parameterAcceptedAs<InvariantBrand<5>>(
				// @ts-expect-error Type 'InvariantBrand<number>' is not assignable to type 'InvariantBrand<5>'
				createInstanceOf<InvariantBrand<number>>(),
			);
			parameterAcceptedAs<InvariantBrand<false>>(
				// @ts-expect-error Type 'InvariantBrand<boolean>' is not assignable to type 'InvariantBrand<false>'
				createInstanceOf<InvariantBrand<boolean>>(),
			);
		});
	});

	describe("unrelated derived brands are not compatible", () => {
		it("`InvariantBrand<T>` is NOT assignable to unrelated `CovariantBrand<T>`", () => {
			parameterAcceptedAs<CovariantBrand<string>>(
				// @ts-expect-error Type 'InvariantBrand<string>' is not assignable to type 'CovariantBrand<string>'
				createInstanceOf<InvariantBrand<string>>(),
			);
			parameterAcceptedAs<CovariantBrand<number>>(
				// @ts-expect-error Type 'InvariantBrand<number>' is not assignable to type 'CovariantBrand<number>'
				createInstanceOf<InvariantBrand<number>>(),
			);
			parameterAcceptedAs<CovariantBrand<boolean>>(
				// @ts-expect-error Type 'InvariantBrand<boolean>' is not assignable to type 'CovariantBrand<boolean>'
				createInstanceOf<InvariantBrand<boolean>>(),
			);
		});

		it("`InvariantBrand<T>` is NOT assignable to unrelated `ContravariantBrand<T>`", () => {
			parameterAcceptedAs<ContravariantBrand<string>>(
				// @ts-expect-error Type 'InvariantBrand<string>' is not assignable to type 'ContravariantBrand<string>'
				createInstanceOf<InvariantBrand<string>>(),
			);
			parameterAcceptedAs<ContravariantBrand<number>>(
				// @ts-expect-error Type 'InvariantBrand<number>' is not assignable to type 'ContravariantBrand<number>'
				createInstanceOf<InvariantBrand<number>>(),
			);
			parameterAcceptedAs<ContravariantBrand<boolean>>(
				// @ts-expect-error Type 'InvariantBrand<boolean>' is not assignable to type 'ContravariantBrand<boolean>'
				createInstanceOf<InvariantBrand<boolean>>(),
			);
		});

		it("`BivariantBrand<T>` and `RedeclaredBivariantBrand<T>` are not compatible in any direction", () => {
			parameterAcceptedAs<RedeclaredBivariantBrand<string>>(
				// @ts-expect-error Type 'BivariantBrand<string>' is not assignable to type 'RedeclaredBivariantBrand<string>'
				createInstanceOf<BivariantBrand<string>>(),
			);
			parameterAcceptedAs<BivariantBrand<number>>(
				// @ts-expect-error Type 'RedeclaredBivariantBrand<number>' is not assignable to type 'BivariantBrand<number>'
				createInstanceOf<RedeclaredBivariantBrand<number>>(),
			);
		});

		describe("derived brands using private keys are not compatible when otherwise identical", () => {
			it("`BrandUsingPrivateKey<T>` and `AnotherBrandUsingPrivateKey<T>` are not compatible in any direction", () => {
				parameterAcceptedAs<AnotherBrandUsingPrivateKey<string>>(
					// @ts-expect-error Type 'BrandUsingPrivateKey<string>' is not assignable to type 'AnotherBrandUsingPrivateKey<string>'
					createInstanceOf<BrandUsingPrivateKey<string>>(),
				);
				parameterAcceptedAs<BrandUsingPrivateKey<number>>(
					// @ts-expect-error Type 'AnotherBrandUsingPrivateKey<number>' is not assignable to type 'BrandUsingPrivateKey<number>'
					createInstanceOf<AnotherBrandUsingPrivateKey<number>>(),
				);
			});
		});
	});

	describe("intersected brands are compatible with their components", () => {
		it("`InvariantBrandFromCoAndContraVariants<B>` is assignable to `CovariantBrand<A>` when `B` is a subtype of `A`", () => {
			parameterAcceptedAs<CovariantBrand<string>>(
				createInstanceOf<InvariantBrandFromCoAndContraVariants<"literal">>(),
			);
			parameterAcceptedAs<CovariantBrand<number>>(
				createInstanceOf<InvariantBrandFromCoAndContraVariants<5>>(),
			);
			parameterAcceptedAs<CovariantBrand<boolean>>(
				createInstanceOf<InvariantBrandFromCoAndContraVariants<false>>(),
			);
		});

		it("`InvariantBrandFromCoAndContraVariants<B>` is NOT assignable to `CovariantBrand<A>` when `A` is a subtype of `B`", () => {
			parameterAcceptedAs<CovariantBrand<"literal">>(
				// @ts-expect-error Type 'InvariantBrandFromCoAndContraVariants<string>' is not assignable to type 'CovariantBrand<"literal">'
				createInstanceOf<InvariantBrandFromCoAndContraVariants<string>>(),
			);
			parameterAcceptedAs<CovariantBrand<5>>(
				// @ts-expect-error Type 'InvariantBrandFromCoAndContraVariants<number>' is not assignable to type 'CovariantBrand<5>'
				createInstanceOf<InvariantBrandFromCoAndContraVariants<number>>(),
			);
			parameterAcceptedAs<CovariantBrand<false>>(
				// @ts-expect-error Type 'InvariantBrandFromCoAndContraVariants<boolean>' is not assignable to type 'CovariantBrand<false>'
				createInstanceOf<InvariantBrandFromCoAndContraVariants<boolean>>(),
			);
		});

		it("`InvariantBrandFromCoAndContraVariants<B>` is NOT assignable to `ContravariantBrand<A>` when `B` is a subtype of `A`", () => {
			parameterAcceptedAs<ContravariantBrand<string>>(
				// @ts-expect-error Type 'InvariantBrandFromCoAndContraVariants<"literal">' is not assignable to type 'ContravariantBrand<string>'
				createInstanceOf<InvariantBrandFromCoAndContraVariants<"literal">>(),
			);
			parameterAcceptedAs<ContravariantBrand<number>>(
				// @ts-expect-error Type 'InvariantBrandFromCoAndContraVariants<5>' is not assignable to type 'ContravariantBrand<number>'
				createInstanceOf<InvariantBrandFromCoAndContraVariants<5>>(),
			);
			parameterAcceptedAs<ContravariantBrand<boolean>>(
				// @ts-expect-error Type 'InvariantBrandFromCoAndContraVariants<false>' is not assignable to type 'ContravariantBrand<boolean>'
				createInstanceOf<InvariantBrandFromCoAndContraVariants<false>>(),
			);
		});

		it("`InvariantBrandFromCoAndContraVariants<B>` is assignable to `ContravariantBrand<A>` when `A` is a subtype of `B`", () => {
			parameterAcceptedAs<ContravariantBrand<"literal">>(
				createInstanceOf<InvariantBrandFromCoAndContraVariants<string>>(),
			);
			parameterAcceptedAs<ContravariantBrand<5>>(
				createInstanceOf<InvariantBrandFromCoAndContraVariants<number>>(),
			);
			parameterAcceptedAs<ContravariantBrand<false>>(
				createInstanceOf<InvariantBrandFromCoAndContraVariants<boolean>>(),
			);
		});
	});

	describe("incorrect declarations allow potentially undesired compatibility", () => {
		it("`UndistinguishedBrand<T>` and `AnotherUndistinguishedBrand<T>` are not compatible in any direction", () => {
			parameterAcceptedAs<AnotherUndistinguishedBrand<string>>(
				createInstanceOf<UndistinguishedBrand<string>>(),
			);
			parameterAcceptedAs<UndistinguishedBrand<number>>(
				createInstanceOf<AnotherUndistinguishedBrand<number>>(),
			);
		});
	});

	describe("simple brands are covariant over brand", () => {
		it("`BrandedType<B>` is assignable to `BrandedType<A>` when `B` is a subtype of `A`", () => {
			parameterAcceptedAs<BrandedType<`encoded${string}`>>(
				createInstanceOf<BrandedType<"encoded">>(),
			);
			parameterAcceptedAs<BrandedType<"zero" | "positive">>(
				createInstanceOf<BrandedType<"zero">>(),
			);
			parameterAcceptedAs<BrandedType<"zero" | "positive">>(
				createInstanceOf<BrandedType<"positive">>(),
			);
		});
		it("`BrandedType<B>` is NOT assignable to `BrandedType<A>` when `A` is a subtype of `B`", () => {
			parameterAcceptedAs<BrandedType<"encoded">>(
				// @ts-expect-error Type 'BrandedType<`encoded${string}`>' is not assignable to type 'BrandedType<"encoded">'
				createInstanceOf<BrandedType<`encoded${string}`>>(),
			);
			parameterAcceptedAs<BrandedType<"zero">>(
				// @ts-expect-error Type 'BrandedType<"zero" | "positive">' is not assignable to type 'BrandedType<"zero">'
				createInstanceOf<BrandedType<"zero" | "positive">>(),
			);
		});
	});

	describe("simple brands can define their own compatibility", () => {
		it("`B & BrandedType<X>` is assignable to `A & BrandedType<X>` when `B` is a subtype of `A`", () => {
			parameterAcceptedAs<BrandedString>(createInstanceOf<"B" & BrandedType<"encoded">>());
			parameterAcceptedAs<typeof brandedNumber>(createInstanceOf<0 & BrandedType<"zero">>());
			parameterAcceptedAs<typeof brandedObject>(
				createInstanceOf<(() => void) & BrandedType<"its a secret">>(),
			);
			parameterAcceptedAs<typeof brandedObjectWithString>(
				createInstanceOf<
					{
						string: "literal";
					} & BrandedType<"metadata">
				>(),
			);
			parameterAcceptedAs<((a: string) => void) & BrandedType<"function brand">>(
				createInstanceOf<(() => object) & BrandedType<"function brand">>(),
			);
		});

		it("`B & BrandedType<X>` is NOT assignable to `A & BrandedType<X>` when `A` is a subtype of `B`", () => {
			parameterAcceptedAs<"B" & BrandedType<"encoded">>(
				// @ts-expect-error Type 'string & BrandedType<"encoded">' is not assignable to type '"B" & BrandedType<"encoded">'
				brandedString,
			);
			parameterAcceptedAs<0 & BrandedType<"zero">>(
				// @ts-expect-error Type 'number & BrandedType<"zero">' is not assignable to type '0 & BrandedType<"zero">'
				brandedNumber,
			);
			parameterAcceptedAs<(() => void) & BrandedType<"its a secret">>(
				// @ts-expect-error Type 'object & BrandedType<"its a secret">' is not assignable to type '() => void & BrandedType<"its a secret">'
				brandedObject,
			);
			parameterAcceptedAs<
				{
					string: "literal";
				} & BrandedType<"metadata">
			>(
				// @ts-expect-error '{ string: string; } & BrandedType<"metadata">' is not assignable to parameter of type '{ string: "literal"; } & BrandedType<"metadata">'
				brandedObjectWithString,
			);
			parameterAcceptedAs<(() => void) & BrandedType<"function brand">>(
				// @ts-expect-error Type '((a: string) => void) & BrandedType<"function brand">' is not assignable to type '(() => void) & BrandedType<"function brand">'
				createInstanceOf<((a: string) => void) & BrandedType<"function brand">>(),
			);
			parameterAcceptedAs<((a: string) => object) & BrandedType<"function brand">>(
				// @ts-expect-error Type '((a: string) => void) & BrandedType<"function brand">' is not assignable to parameter of type '((a: string) => object) & BrandedType<"function brand">'
				createInstanceOf<((a: string) => void) & BrandedType<"function brand">>(),
			);
		});
	});

	it("`BrandedType` example is valid", () => {
		function numberIs5(n: number): n is number & CovariantBrand<5> {
			return n === 5;
		}
		function onlyAccept4_5_or_6(_n: number & CovariantBrand<4 | 5 | 6>): void {}

		function example(n: number): void {
			if (numberIs5(n)) {
				onlyAccept4_5_or_6(n); // OK: CovariantBrand<5> is assignable to CovariantBrand<4 | 5 | 6>;
			}
		}

		example(4);
		example(5);
		example(6);
	});
});

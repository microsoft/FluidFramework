import {
    areSafelyAssignable,
    Brand,
    isAssignableTo,
    Opaque,
    RecursiveReadonly,
    requireFalse,
    requireTrue,
} from "../../util";

// Type tests for RecursiveReadonly
{
    type TestInner = Set<number>;
    type TestInnerString = Set<string>;
    type TestInnerReadonly = ReadonlySet<number>;
    // Checks assignability of equivalent types
    {
        type _basic = requireTrue<areSafelyAssignable<RecursiveReadonly<number>, number>>;
        type _union = requireTrue<
            areSafelyAssignable<RecursiveReadonly<number | string>, number | string>
        >;
        type _intersection = requireTrue<
            areSafelyAssignable<RecursiveReadonly<number & string>, number & string>
        >;
        type _brand = requireTrue<
            areSafelyAssignable<RecursiveReadonly<Brand<number, string>>, Brand<number, string>>
        >;
        type _brandNested = requireTrue<
            areSafelyAssignable<
                RecursiveReadonly<Brand<TestInner, string>>,
                Brand<TestInnerReadonly, string>
            >
        >;
        type _opaque = requireTrue<
            areSafelyAssignable<
                RecursiveReadonly<Opaque<Brand<number, string>>>,
                Opaque<Brand<number, string>>
            >
        >;
        type _opaqueNested = requireTrue<
            areSafelyAssignable<
                RecursiveReadonly<Opaque<Brand<TestInner, string>>>,
                // Opaque already makes the inner type unmutable
                Opaque<Brand<TestInner, string>>
            >
        >;
        type _set = requireTrue<
            areSafelyAssignable<RecursiveReadonly<Set<number>>, ReadonlySet<number>>
        >;
        type _setNested = requireTrue<
            areSafelyAssignable<RecursiveReadonly<Set<TestInner>>, ReadonlySet<TestInnerReadonly>>
        >;
        type _map = requireTrue<
            areSafelyAssignable<RecursiveReadonly<Map<number, string>>, ReadonlyMap<number, string>>
        >;
        type _mapNestedKey = requireTrue<
            areSafelyAssignable<
                RecursiveReadonly<Map<TestInner, string>>,
                ReadonlyMap<TestInnerReadonly, string>
            >
        >;
        type _mapNestedValue = requireTrue<
            areSafelyAssignable<
                RecursiveReadonly<Map<string, TestInner>>,
                ReadonlyMap<string, TestInnerReadonly>
            >
        >;
        type _array = requireTrue<
            areSafelyAssignable<RecursiveReadonly<number[]>, readonly number[]>
        >;
        type _arrayNested = requireTrue<
            areSafelyAssignable<RecursiveReadonly<TestInner[]>, readonly TestInnerReadonly[]>
        >;
        type _obj = requireTrue<
            areSafelyAssignable<RecursiveReadonly<{ a: number }>, { readonly a: number }>
        >;
        type _objNested = requireTrue<
            areSafelyAssignable<
                RecursiveReadonly<{ a: TestInner }>,
                { readonly a: TestInnerReadonly }
            >
        >;
    }
    // Check non-assignability of non-equivalent types
    {
        type _basic = requireFalse<isAssignableTo<RecursiveReadonly<string>, number>>;
        type _union = requireFalse<
            isAssignableTo<RecursiveReadonly<number | boolean>, symbol | string>
        >;
        type _intersection = requireFalse<
            isAssignableTo<RecursiveReadonly<number & boolean>, number & string>
        >;
        type _brand = requireFalse<
            isAssignableTo<RecursiveReadonly<Brand<string, string>>, Brand<number, string>>
        >;
        type _brandNested = requireFalse<
            isAssignableTo<
                RecursiveReadonly<Brand<TestInnerString, string>>,
                Brand<TestInnerReadonly, string>
            >
        >;
        type _opaque = requireFalse<
            isAssignableTo<
                RecursiveReadonly<Opaque<Brand<string, string>>>,
                Opaque<Brand<number, string>>
            >
        >;
        type _opaqueNested = requireFalse<
            isAssignableTo<
                RecursiveReadonly<Opaque<Brand<TestInnerString, string>>>,
                // Opaque already makes the inner type unmutable
                Opaque<Brand<TestInner, string>>
            >
        >;
        type _set = requireFalse<isAssignableTo<RecursiveReadonly<Set<number>>, Set<number>>>;
        type _setNested = requireFalse<
            isAssignableTo<RecursiveReadonly<Set<TestInner>>, ReadonlySet<TestInner>>
        >;
        type _map = requireFalse<
            isAssignableTo<RecursiveReadonly<Map<number, string>>, Map<number, string>>
        >;
        type _mapNestedKey = requireFalse<
            isAssignableTo<
                RecursiveReadonly<Map<TestInner, string>>,
                ReadonlyMap<TestInner, string>
            >
        >;
        type _mapNestedValue = requireFalse<
            isAssignableTo<
                RecursiveReadonly<Map<string, TestInner>>,
                ReadonlyMap<string, TestInner>
            >
        >;
        type _array = requireFalse<isAssignableTo<RecursiveReadonly<number[]>, number[]>>;
        type _arrayNested = requireFalse<
            isAssignableTo<RecursiveReadonly<TestInner[]>, readonly TestInner[]>
        >;
        // Why does this fail? The whole point is to ensure this.
        type _obj = requireFalse<isAssignableTo<RecursiveReadonly<{ a: number }>, { a: number }>>;
        type _objNested = requireFalse<
            isAssignableTo<RecursiveReadonly<{ a: TestInner }>, { readonly a: TestInner }>
        >;
    }
}

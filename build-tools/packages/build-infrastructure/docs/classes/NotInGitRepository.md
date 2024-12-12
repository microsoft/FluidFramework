[**@fluid-tools/build-infrastructure**](../README.md) • **Docs**

***

[@fluid-tools/build-infrastructure](../README.md) / NotInGitRepository

# Class: NotInGitRepository

An error thrown when a path is not within a Git repository.

## Extends

- `Error`

## Constructors

### new NotInGitRepository()

```ts
new NotInGitRepository(path): NotInGitRepository
```

#### Parameters

• **path**: `string`

#### Returns

[`NotInGitRepository`](NotInGitRepository.md)

#### Overrides

`Error.constructor`

#### Defined in

[packages/build-infrastructure/src/errors.ts:10](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/errors.ts#L10)

## Properties

### message

```ts
message: string;
```

#### Inherited from

`Error.message`

#### Defined in

node\_modules/.pnpm/typescript@5.4.5/node\_modules/typescript/lib/lib.es5.d.ts:1077

***

### name

```ts
name: string;
```

#### Inherited from

`Error.name`

#### Defined in

node\_modules/.pnpm/typescript@5.4.5/node\_modules/typescript/lib/lib.es5.d.ts:1076

***

### path

```ts
readonly path: string;
```

#### Defined in

[packages/build-infrastructure/src/errors.ts:10](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-infrastructure/src/errors.ts#L10)

***

### stack?

```ts
optional stack: string;
```

#### Inherited from

`Error.stack`

#### Defined in

node\_modules/.pnpm/typescript@5.4.5/node\_modules/typescript/lib/lib.es5.d.ts:1078

***

### prepareStackTrace()?

```ts
static optional prepareStackTrace: (err, stackTraces) => any;
```

Optional override for formatting stack traces

#### Parameters

• **err**: `Error`

• **stackTraces**: `CallSite`[]

#### Returns

`any`

#### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

#### Inherited from

`Error.prepareStackTrace`

#### Defined in

node\_modules/.pnpm/@types+node@18.19.60/node\_modules/@types/node/globals.d.ts:98

***

### stackTraceLimit

```ts
static stackTraceLimit: number;
```

#### Inherited from

`Error.stackTraceLimit`

#### Defined in

node\_modules/.pnpm/@types+node@18.19.60/node\_modules/@types/node/globals.d.ts:100

## Methods

### captureStackTrace()

```ts
static captureStackTrace(targetObject, constructorOpt?): void
```

Create .stack property on a target object

#### Parameters

• **targetObject**: `object`

• **constructorOpt?**: `Function`

#### Returns

`void`

#### Inherited from

`Error.captureStackTrace`

#### Defined in

node\_modules/.pnpm/@types+node@18.19.60/node\_modules/@types/node/globals.d.ts:91

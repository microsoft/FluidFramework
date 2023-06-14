# Parameterized DDSes

This design document centers around the problem of providing better support for "parameterized DDSes,"
aka a DDS which is configurable in some way by an application author.
The current APIs are generally sufficient for DDSes whose only parameters affect runtime behavior in a way that doesn't have compatibility issues.
For example, one could imagine writing a DDS with a "noisy" mode that emits many more diagnostic events on changes but otherwise behaves the same.
There are no compatibility concerns with this sort of parameter:
clients within a collaboration session are free to disagree on whether the extra events are emitted,
and a document created by a client with one level of verbosity can be later opened by a client with a different level.

However, the APIs start to have issues when considering parameters which might result in compatibility issues.
There are a few reasons why supporting such parameters is desirable:

1. The DDS supports functionality requiring persisted data on which applications may want different policies, or may not want at all (and would like pay-to-play semantics)
    - Current examples: attribution, legacy `SharedTree`'s `summarizeHistory` flag
    - Potential other examples: DDS implementations with configurable merge behavior
2. The DDS has compatibility constraints which it would like to delegate to the application author to resolve. The motivating use case is:
    - A DDS implements a new, more efficient snapshot or op format.
      Package versions beneath the initial release of this snapshot encoding won't understand it and will crash if they attempt to read it.
      The DDS author would like the application writer to select which format to use (and should provide documentation that code version Foo must be rolled out
      to all clients before the new snapshot format is written).

The type of compatibility situation described in #2 has already occurred for a number of DDSes (legacy SharedTree, SharedDirectory, SharedString).

## Motivation

The Fluid codebase already has several examples of patterns that DDS authors have used to partially solve this problem.
To understand issues in those patterns, let's first consider the general shape of the DDS creation APIs.

Below are the relevant bits of Fluid in play, with typical boilerplate implementations for a parameterless DDS:

```typescript
interface IChannelFactory {
	/**
	 * String representing the type of the factory.
	 */
	readonly type: string;

	/**
	 * Attributes of the channel.
	 */
	readonly attributes: IChannelAttributes;

	/**
	 * Loads the given channel.
	 */
	load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<IChannel>;

	/**
	 * Creates a local version of the channel.
	 * Calling attach on the object later will insert it into the object stream.
	 */
	create(runtime: IFluidDataStoreRuntime, id: string): IChannel;
}

// Publicly exported
class SharedSomething extends SharedObject {
	public static create(runtime: IFluidDatastoreRuntime, id?: string): SharedSomething {
		return runtime.createChannel(id, SharedSomethingFactory.Type) as SharedSomething;
	}

	public static getFactory(): SharedSomethingFactory {
		return new SharedSomethingFactory();
	}
}

class SharedSomethingFactory implements IChannelFactory {
	public static Type = "SharedSomething"; // or some unique string

	public static readonly Attributes: IChannelAttributes = {
		type: SharedSomethingFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	// This implements IChannelFactory by referencing the above statics, and directly invoking
	// SharedSomething constructor.
}
```

There are two interesting flows to consider: initial creation of a DDS, and load of a DDS which has already been created.

### Initial Creation

A container author typically creates a new DDS like so:

```typescript
const myDDS = SharedSomething.create(runtime);
// do whatever they like, typically storing a handle to `myDDS` in the root `SharedDirectory` of their data object
```

Internally, the call to `.create` delegates to the data store runtime's `createChannel`, which:

-   ensures the runtime's internal state is aware of the channel (i.e. able to submit/process ops on that channel, summarize it, etc)
-   uses the `type` argument (second argument to `createChannel`) to look up the appropriate `IChannelFactory`, then invokes that factory's `create` method.

The factory's `create` method finally directly invokes `SharedSomething`'s constructor.

TODO: talk about azure pattern too

### Existing Load

To understand the load flow, first note that Channel's base summarization method adds an ".attributes" blob to each DDS's summary containing the contents of the `attributes` value used to initialize the DDS at construction time:

```typescript
const attributesBlobKey = ".attributes";

// This is used in the various ChannelContext summary methods.
export function summarizeChannel(
	channel: IChannel,
	fullTree: boolean = false,
	trackState: boolean = false,
	telemetryContext?: ITelemetryContext,
): ISummaryTreeWithStats {
	const summarizeResult = channel.getAttachSummary(fullTree, trackState, telemetryContext);

	// Add the channel attributes to the returned result.
	addBlobToSummary(summarizeResult, attributesBlobKey, JSON.stringify(channel.attributes));
	return summarizeResult;
}
```

Loading a channel is accomplished by examining the `type` field on the `.attributes` blob,
looking up that type in the `ISharedObjectRegistry`,
and invoking the `load` method on the resulting factory.
Note that `load` already receives the channel attributes as input, though current `SharedObject` factories generally don't do much of interest with them.

### Problems

Consider now a case where the DDS authors wants to introduce parameters which impact the format.
A natural option would be to augment `create` and `getFactory`:

```typescript
interface SharedSomethingOptions {
	formatVersion: number;
}

class SharedSomething extends SharedObject {
	public static create(
		runtime: IFluidDatastoreRuntime,
		id?: string,
		params?: Partial<SharedSomethingOptions>,
	): SharedSomething {
		// Uh oh--params unused!
		return runtime.createChannel(id, SharedSomethingFactory.Type) as SharedSomething;
	}

	public static getFactory(params?: Partial<SharedSomethingOptions>): SharedSomethingFactory {
		return new SharedSomethingFactory(params);
	}
}
```

This immediately uncovers one issue: since the static `create` method isn't in charge of constructing the DDS's factory,
there's no place to plumb through the parameters.
Even worse, the container author likely already wrote some code like this:

```typescript
const myDataObject = new DataObjectFactory("foo", MyDataObject, [
	SharedSomething.getFactory({ formatVersion: 5 }),
]);
```

If they later write `SharedSomething.create(runtime, { formatVersion: 4 })`, the create flow outlined above will instead use the
factory created at data object registry construction time.

There is another, more subtle issue with this strategy: how should one implement a `SharedSomethingFactory` which takes in some parameters?

```typescript
class SharedSomethingFactory {
	public constructor(private readonly options: SharedSomethingOptions) {}

	public load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<IChannel> {
		const sharedSomething = new SharedSomething(
			runtime,
			id,
			this.options /* uh oh: channelAttributes and this.options might disagree on snapshot format! */,
		);
		await sharedSomething.load(services);
		return sharedSomething;
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): IChannel {
		const sharedSomething = new SharedSomething(document, id, this.options);
		sharedSomething.initializeLocal();
		return sharedSomething;
	}
}
```

If the channel's attributes clearly reflect its parameters (e.g. the snapshot format being used),
then the resulting factory sometimes produces DDSes which don't match the requested format!

There are essentially two ways to resolve this issue:

1. Make `SharedSomethingFactory` have a parameterless constructor, and pass parameters all the way through the `create` flow (i.e. through `createChannel`, factory lookup, and factory's `create` method).
2. Keep parameters in `SharedSomethingFactory`'s constructor, but change their semantics such that they only necessarily apply to newly created documents.

Regardless of which option we pick, enough information to reify the DDS's parameters needs to be persisted in the attributes blob.

In order to support data objects which can create multiple types of the same shared object with different parameters, option 2 would need to be accompanied by changes to make DDS registration take in named entries in `@fluidframework/aqueduct`, rather than assume the "key" for a DDS registry entry is that DDS's factory's `type` field.
Option 2 would also necessarily force us away from the static `create` method commonly found on DDSes.

```typescript
// Container author code, from the perspective of a container author
// Option 1:
const myDataObject = new DataObjectFactory("foo", MyDataObject, [SharedSomething.getFactory()]);

// later, they make a SharedSomething:
const something = SharedSomething.create({ formatVersion: 5 });

// Option 2:
const myDataObject = new DataObjectFactory("foo", MyDataObject, [
	["v4Something", SharedSomething.getFactory({ formatVersion: 4 })],
	["v5Something", SharedSomething.getFactory({ formatVersion: 5 })],
	// For API back-compat, we could also accept just SharedSomething factories
	// and behind the scenes convert it to
	// [factory.type, factory]
	SharedSomething.getFactory(/* whatever the default options are */),
]);

// later, they make a v5 SharedSomething:
const something = myDataObject.runtime.createChannel("v5Something");
```

The difference between #1 and #2 is then largely whether an author declares parameters for their DDS at _creation time_, or at _data object declaration time_.

Option #1 is roughly prototyped in [this commit](https://github.com/microsoft/FluidFramework/commit/02e34ce16ac543727159f8009244832c572ba442).
In general, I find option #2 the better choice.
It keeps DDS parameter details isolated to the DDS and the change to make DDS factory registry entries named seems like a good uniformization one anyway (data object registry entries already are named).
It also gives a clear place for container authors to express things like "when I load a document which is using snapshot version 1, I want to save it using snapshot version 2" which option #1 doesn't.
Most of the code is already set up in a way that #2 "just works," with only a few aspects needing changes:

-   existing DDSes with multiple formats or parameters should actually leverage the attributes blob to reflect that
-   describeCompat testing code and the azure APIs assume a parameterless `getFactory` function
-   some parameterized DDSes still expose a static `.create` for "default parameters," which should probably have a remarks block documenting preferred patterns for usage

The `describeCompat` issues can be resolved by compat work we were planning anyway (allowing better testing of a compatibility matrix when defining a custom data object).
The difficulties with the azure APIs can be resolved by either:

-   Removing the extra layer of parameterization by exporting some helpers which use a technique like [this](https://github.com/microsoft/FluidFramework/pull/15813#discussion_r1220503942)
-   Implementing some sort of analogous registry mechanism for initial objects and/or making the `.create()` function take parameters.

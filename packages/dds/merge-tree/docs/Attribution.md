# Attribution

This design document covers a high-level plan for embedding attribution information into merge-tree.
It attempts to be detailed enough to start fleshing out proposed optimizations into code, though the actual factoring of the code
(responsibilities of objects, names/semantics) may be subject to change in further refinements of the design.

## Motivation

A common feature in collaborative applications is the ability to attribute pieces of content to a particular user.
This attribution information generally contains information about who edited the content as well as when the edit occurred.

At the time of writing this document, the Fluid Framework doesn't natively support this kind of functionality,
though in theory it has all of the data it needs (the op envelope contains both a timestamp and a client id, which can
be mapped to information about the user using the audience).
This has forced Fluid consumers that want attribution information to use workaround schemes. For example, in SharedString it's
straightforward to conceptualize a scheme where each time a client submits an op that edits the string, it waits for that op to
ack and uses the timestamp on that op to submit an additional op that annotates the edited segments with attribution information.

Besides unnecessarily complicating client code, this has several drawbacks:

-   It is noisy on the wire
-   Attribution information can be lost in various cases if the submitting client disconnects
-   In-memory and snapshot size for the SharedString is more bloated than it should be; without binning the timestamps this strategy
    entirely invalidated the zamboni scheme, and even if the timestamps are binned this will unnecessarily include the same user info
    many times on different segments

Rather than force this burden on consumers, it makes more sense to bake some attribution capability into the Fluid Framework in an opt-in way.
Though this document will cover an approach for doing so in merge-tree (primarily targeted at support for attribution in SharedString),
none of the above concerns are specific to a single DDS.
It's imaginible that Fluid will eventually want to generalize this to a platform mechanism that's supported by each DDS that wants to opt in to it.
For that reason, the design is aimed to modularize into areas that are generic to the container runtime and those that are DDS-specific.

## High-level

If one had access to the entire op stream, a lookup from all historical client ids to their user info,
and every DDS retained information about which sequence number created/modified each part of its data,
attribution would be straightforward. Ask the DDS for the relevant sequence number, then look at this sequence number's op for a timestamp + clientId
and use the client id to look up user information.

All of this information is knowable from the Fluid runtime perspective, though not all of it is persisted indefinitely.
Notably:

-   Access to the entire op stream is an unreasonable assumption due to the summarization process
-   User information is only accessible for connected clients

However, this conceptualization of attribution does suggest a reasonable split of concerns that can be individually assessed:
none of the association between sequence numbers, timestamps, clientIds, and user information is specific to any given DDS.
Thus, all of this bookkeeping could be generically done by the framework (potential candidates include on container runtime, data store runtime, or channel context),
and any query-style APIs a DDS might support for retrieving attribution information could be accomplished by asking the runtime for information about a given sequence number.

This leaves two high-level problems:

1. How can the framework manage to associate sequence numbers to attribution information efficiently?
2. What degrees of freedom should merge-tree expose for attributing its state to different users?

## Sequence Number to Attribution Association

Setting aside the problem of where to put the state for now, there are two primary ways by which associations between sequence numbers and attribution
can be made practical from a memory perspective.
First, there needs to be a garbage collection scheme to clean up attribution information on removed content.

Secondly, attribution information needs to be compacted to an efficient format, both in terms of snapshot size (i.e. plain data representation) and desired
level of granularity (applications don't care about millisecond-accurate timestamps).

Finally, the in-memory data structures that support the necessary APIs are discussed.

### Cleanup of outdated information

Since the semantics of each op is opaque to the runtime, the runtime needs some mechanism to ascertain when an op's attribution is no longer relevant, i.e.
not referenced.

There are a few general models that could work:

1. Assume that the runtime controls authoring of references to attribution information. It could stamp such information with a unique symbol such that it could
   later be recognized in serialization to determine if the info was still referenced.
   This approach is not far off from how `IFluidHandle`s work.
   Reference counting the created objects could also work, but would likely be messier (responsibility of cleanup will likely end up extending past where we want it).
2. Demand objects that store attribution information implement a function that exposes all sequence numbers they reference.

Option 1 might look something like

```typescript
const attributionHandle = Symbol("attribution handle");

class /*Container/DataStore/etc. (TBD)*/ Runtime {
	public createAttributionHandle(sequenceNumber: number) {
		return {
			[attributionHandle]: true,
			sequenceNumber,
		};
	}
}

// Serialization logic in ISerializer would need to look for attributionHandle symbol usages
// and serialize it appropriately.
// Similarly for deserialization.
// At summary time, the set of sequence numbers that were referenced can be recorded for each data store,
// and any sequence numbers that are no longer referenced could have their attribution information cleaned up.
// Incremental summaries make the bookkeeping of this scheme slightly more complicated, but the general idea
// still works.
```

The main advantage of option 1 is that it requires less DDS/application code.
However, it causes larger-sized snapshots, since the serialized form of runtime-minted attribution handles will be more verbose than a simple number.
It also leads to a potentially nasty bug pit: there's not a practical way to enforce that objects storing attribution information actually call
`createAttributionHandle` before serializing their data: they could just as easily store the sequence number and only call `createAttributionHandle`
directly before trying to obtain attribution information.
This would risk attribution information getting GC'd too early.

Option 2 would look closer to this:

```typescript
interface IReferenceAttributionInfo {
	/**
	 * @returns an iterable over all sequence numbers for which this object references attribution information.
	 */
	getReferencedSeqs(): Iterable<number>;
}

class MergeTree implements IReferenceAttributionInfo {
	public getReferencedSeqs() {
		const seqs = new Set();
		this.walkAllSegments(this.root, (seg) => {
			seqs.add(seg.seq);
		});
		return seqs;
	}
}
```

Though this design forces extra code on users, it's typically not conceptually difficult to implement and enables the serialized format to be more compact.

It's worth noting that both of these models have interesting interactions with partial checkouts / schemes for more incremental summarization at the DDS level (via blob re-use [see #832](https://dev.azure.com/fluidframework/internal/_workitems/edit/832)): each would need to support some notion of reference count deltas from the previous result.

### Compaction of similar information

One primary motivation for supporting attribution information natively in the framework is the potential to reduce redundant attribution information in snapshots.
There are two obvious ways data is redundant: user information gets repeatedly inlined into `JSON.stringify`d content, and various sets of ops all likely have
virtually the same attribution information (same user, perhaps a slightly different timestamp).
Ops that have closer together sequence number are more likely to contain such redundant information, as users tend to edit documents in bursts.
This suggests a few strategies for keeping a compact format (either only on serialization or in-memory as well):

1. Intern user objects
2. Intern attribution objects
3. If a range of sequence numbers all have the same attribution information, store it as such
4. Allow "equivalent timestamp" policy injection: it's unlikely any app needs millisecond or better accuracy on the server ack timestamp for attribution purposes.
   There should be a configurable policy for how timestamps get binned. Basic implementations could bin on a fixed cadence, but for even more compact files a dynamic bin size policy with larger bins for less recent data could also give a reasonable user experience

Optimizations 1 through 3 are all things that standard compression algorithms can detect: interning objects is essentially
[dictionary compression](https://en.wikipedia.org/wiki/Dictionary_coder) and compressing adjacent ranges is
[run-length encoding](https://en.wikipedia.org/wiki/Run-length_encoding), so before going through the trouble of writing bespoke compression code
we should experiment with things like [LZ4](<https://en.wikipedia.org/wiki/LZ4_(compression_algorithm)>) and [DEFLATE](https://en.wikipedia.org/wiki/Deflate).
For the purposes of illustration, the following sections will outline how the bespoke code might look.

#### Interning

Rather than repeatedly serialize the same information in the snapshot format, we can internally add a level of indirection to the `user` field, the entire
attribution object, or both.
This optimization would be entirely transparent to the public API: whatever snapshot/in-memory format we use, we'd always convert to `AttributionInfo` before
returning the information for a given seq to the DDS/application.

Interfaces might look like this, with exported properties being those visible to an application:

```typescript
export interface AttributionInfo {
	user: IUser;
	timestamp: number;
}

export interface IAttributor {
	getAttributionInfo(seq: number): AttributionInfo;
}

type InternedRef = number & { readonly InternedRef: "e86840d8-8384-450c-b0e3-9a2855ba2d21" };

interface ObjectInterner {
	getOrCreateRef(obj: Jsonable): InternedRef;
	getObject(id: InternedRef): Jsonable;
	getSerializable(): Jsonable;
}

interface CompactAttributionInfo {
	userRef: InternedRef;
	timestamp: number;
}

// Concrete types for a particular `Attributor` implementation
interface SerializedAttributor {
	interner: Jsonable /* result of calling getSerializable() on an ObjectInterner */;
	lookup: {
		[seq: number]: InternedRef /* to CompactAttributionInfo */ | CompactAttributionInfo;
	};
}
```

#### Adjacent Range Coalescing

Typical documents will likely have a number of consecutive ops with the same attribution information.
This happens for a few reasons: users might make a number of edits in a short period of time (consider a user typing
out a new paragraph), and ops submitted by a single container are batched under some circumstances.

Rather than end up with a `SerializedAttributor` that resembles this:

```javascript
{
  interner: [{ email: "john.doe@contoso.com", id: "f400ddf3-4d04-48e9-8783-4b1db8a45fc3" }, { user: 0, timestamp: 1661974200000 }],
  lookup: {
    50: 1,
    51: 1,
    52: 1,
    53: 1,
    54: 1
  }
}
```

we could instead serialize the lookup table like so:

```javascript
{
  interner: [{ email: "john.doe@contoso.com", id: "f400ddf3-4d04-48e9-8783-4b1db8a45fc3" }, { user: 0, timestamp: 1661974200000 }],
  lookup: [{ key: [50, 54], value: 1 }]
}
```

Since objects are distinguishable from numbers, single-number ranges could just have a number key.

```typescript
interface AttributionEntry {
	/**
	 * Either a single `seq` number for this attribution entry, or a consecutive range `[start, end]` (inclusive)
	 * of `seq` numbers which all have the same attribution information.
	 */
	k: number | [number, number];
	v: InternedRef | CompactAttributionInfo;
}

// Concrete types for a particular `Attributor` implementation
interface SerializedAttributor {
	interner: Jsonable /* result of calling getSerializable() on an ObjectInterner */;
	lookup: AttributionEntry[];
}
```

#### Timestamp Binning

One key aspect of information compaction is the ability to bin the precise timestamps given by the server into more reasonable granularity levels for attribution.
Unlike the other optimizations to compact information, binning is lossy.
Binning can simply be dictated by a function that takes in a timestamp and returns a timestamp for the output bin.
Simple strategies like "bin every 5 minutes" are as simple as `(timestamp: number) => timestamp - (timestamp % (1000 * 60 * 5))`,
but allowing an arbitrary function here also empowers more advanced users to make partitions of timespace like "5-minute granularity up to a day ago, 1-day granularity up to a month ago, 1-month granularity up to a year ago, yearly granularity otherwise".
For the simple strategy, running the binning function on initial sequencing of the op would be sufficient.
To make the second function behave as desired ("old attribution information tends to get coalesced"),
the runtime would also have to re-bin existing attribution information either every so often or just on document load.

We should apply this optimization last, and only if we need it. It's possible standard time-series compression of numbers will be sufficient here.

### In-memory attribution structure

Attributor bookkeeping needs to efficiently support:

-   Lookup of attribution information at a `seq`
-   Adding attribution information for a newly sequenced op
-   Merging consecutive attribution entries that should now be coalesced (depending on other design choices, this one is less important)

One candidate implementation would be to expand the serialized format entirely and use a `Map`. This implementation is viable, but uses
`O(attributed seq#s)` memory. It would provide `O(1)` lookup.
Another reasonable candidate would be to keep the overall structure of having coalesced adjacent ranges, putting the serialized form into a
sorted list that can be binary searched.
This would give a reasonable memory win at the cost of increasing lookup time to `O(log(attributed seq#s))`.

Putting all of the optimizations together, an `Attributor` implementation might look something like this:

```typescript
export interface IAttributor {
  getAttributionInfo(seq: number): AttributionInfo;
}

export const binByMinutes = (interval: number) => (timestamp: number) => timestamp - (timestamp % (1000 * 60 * interval));

const seqComparator = (a: AttributionEntry, b: AttributionEntry) => {
  aEnd = typeof a.k === 'number' ? a.k : a.k[1];
  bEnd = typeof a.k === 'number' ? b.k : b.k[1];
  return aEnd - bEnd;
}

class Attributor implements IAttributor {
  private seqToInfo: SortedList<AttributionEntry> = new SortedList(seqComparator);
  constructor(
    runtime: IFluidDataStoreRuntime,
    serialized?: SerializedAttributor,
    bin: (timestamp: number) => number = binByMinutes(5)
  ) {
    if (serialized) {
      const interner = new ObjectInterner(serialized.interner);
      // Note: this implementation doesn't coalesce re-binned attribution entries that are newly equivalent and adjacent.
      this.seqToInfo.extend(...serialized.lookup.map(({ k, v: internedV }) => {
        const { timestamp, userRef } = isInternedRef(maybeInternedV) ? interner.getObject(maybeInternedV) : maybeInternedV;
        const v = {
          timestamp: bin(timestamp),
          user: interner.getObject(userRef)
        };
        return { k, v };
      }));
    }

    const { deltaManager, audience } = runtime;
    deltaManager.on("op", (message: ISequencedDocumentMessage) => {
      const attributionInfo = {
         /* note: for object interning to work, this needs to be a referentially equal user object. If that isn't provided by the
            Fluid Framework, we probably would want a layer of caching here. For interning of overall attribution info objects,
            we may want a similar cache. */
        user: audience.get(message.clientId).user,
        timestamp: bin(message.timestamp)
      };
      const { k, v } = seqToInfo.getAt(seqToInfo.length - 1);
      const lastEntryStart = typeof k === 'number' ? k : k[0];
      const lastEntryEnd = typeof k === 'number' ? k : k[1];
      if (
        attributionInfosAreEquivalent(attributionInfo, v) &&
        // Note: this coalescing logic is somewhat unideal since no-ops break it.
        message.seq === 1 + lastEntryEnd)
      ) {
        this.seqToInfo.pop();
        this.seqToInfo.insert({ k: [lastEntryStart, message.seq], v });
      } else {
        this.seqToInfo.insert({ k: message.seq, v: attributionInfo });
      }
    });
  }

  public getAttributionInfo(seq: number): AttributionInfo {
    const { k, v } = seqToInfo.findAtOrAfter(seq);
    assert(k === seq || (k.length === 2 && k[0] <= seq && seq <= k[1]));
    return v;
  }

  // Unpictured:
  // - serialization (not interesting; deserialization logic is pictured)
  // - GC (there are several ways to hook this up, though one can check the data structure should support it in O(n))
}

```

### Bookkeeping Placement Considerations

There are several levels that the framework could choose to conceptually store "sequence number to attribution" information:

-   Container Runtime
-   Data store runtime
-   DDS

The initial attributor implementation will likely be hooked up to only `SharedString` due to current feature asks of partner teams.
However, it's worth calling out that depending on which layer the runtime places the information, there are consequences with respect
to GC and how well information compacts.

For GC:

-   Determining whether sequence numbers are referenced by any attribution information gets complicated slightly by incremental summarization if
    information is stored on container runtime

For compaction:

-   Compaction schemes potentially get worse for sequences of ops that alter different data stores if attribution information is stored at a
    fine-grained level (e.g. DDS, Data store runtime).

## Merge-Tree Attribution API

TODO: This section will cover planned extension points for specifying attribution information on merge-tree.

My current thinking is something along the lines of the following:

Segments have a `attribution` field which is an opaque object to merge-tree, but splits/combines/impacts merge behavior a la tracking groups.
Users of merge-tree are empowered to inject policy into the `attribution` of the segment as they see fit.
The most basic policy which we should get for free would be to use `clientSeq` as the only tracked attribution state, which corresponds to
an application that only wants to track who inserted the segment and when they did it.

More advanced users could provide fancier json-serializable state objects such as `{ inserted: number, annotated: number }` and set up proper
semantics for those fields.

I need to think through if current merge-tree delta operation events are a sufficient entrypoint for managing such state, or if there's a nicer
way to encapsulate common desires.

{
  "title": "IIdCompressor Interface",
  "summary": "A distributed UUID generator and compressor.\n\nGenerates arbitrary non-colliding v4 UUIDs, called stable IDs, for multiple 'sessions' (which can be distributed across the network), providing each session with the ability to map these UUIDs to `numbers`.\n\nA session is a unique identifier that denotes a single compressor. New IDs are created through a single compressor API which should then sent in ranges to the server for total ordering (and are subsequently relayed to other clients). When a new ID is created it is said to be created by the compressor's 'local' session.\n\nFor each stable ID created, two numeric IDs are provided by the compressor:\n\n1. A session-local ID, which is stable for the lifetime of the session (which could be longer than that of the compressor object, as it may be serialized for offline usage). Available as soon as the stable ID is allocated. These IDs are session-unique and are thus only safely usable within the scope of the compressor that created it.\n\n2. A final ID, which is stable across serialization and deserialization of an IdCompressor. Available as soon as the range containing the corresponding session-local ID is totally ordered (via consensus) with respect to other sessions' allocations. Final IDs are known to and publicly usable by any compressor that has received them.\n\nCompressors will allocate UUIDs in non-random ways to reduce entropy allowing for optimized storage of the data needed to map the UUIDs to the numbers.\n\nThe following invariants are upheld by IdCompressor:\n\n1. Session-local IDs will always decompress to the same UUIDs for the lifetime of the session.\n\n2. Final IDs will always decompress to the same UUIDs.\n\n3. After a server-processed range of session-local IDs (from any session) is received by a compressor, any of those session-local IDs may be translated by the compressor into the corresponding final ID. For any given session-local ID, this translation will always yield the same final ID.\n\n4. A UUID will always compress into the same session-local ID for the lifetime of the session.\n\nSession-local IDs are sent across the wire in efficiently-represented ranges. These ranges are created by querying the compressor, and \\*must\\* be ordered (i.e. sent to the server) in the order they are created in order to preserve the above invariants.\n\nSession-local IDs can be used immediately after creation, but will eventually (after being sequenced) have a corresponding final ID. This could make reasoning about equality of those two forms difficult. For example, if a cache is keyed off of a session-local ID but is later queried using the final ID (which is semantically equal, as it decompresses to the same UUID/string) it will produce a cache miss. In order to make using collections of both remotely created and locally created IDs easy, regardless of whether the session-local IDs have been finalized, the compressor defines two 'spaces' of IDs:\n\n1. Session space: in this space, all IDs are normalized to their 'most local form'. This means that all IDs created by the local session will be in local form, regardless of if they have been finalized. Remotely created IDs, which could only have been received after finalizing and will never have a local form for the compressor, will of course be final IDs. This space should be used with consumer APIs and data structures, as the lifetime of the IDs is guaranteed to be the same as the compressor object. Care must be taken to not use these IDs across compressor objects, as the local IDs are specific to the compressor that created them.\n\n2. Op space: in this space, all IDs are normalized to their 'most final form'. This means that all IDs except session-local IDs that have not yet been finalized will be in final ID form. This space is useful for serialization in ops (e.g. references), as other clients that receive them need not do any work to normalize them to \\*their\\* session-space in the common case. Note that IDs in op space may move out of Op space over time, namely, when a session-local ID in this space becomes finalized, and thereafter has a 'more final form'. Consequentially, it may be useful to restrict parameters of a persisted type to this space (to optimize perf), but it is potentially incorrect to use this type for a runtime variable. This is an asymmetry that does not affect session space, as local IDs are always as 'local as possible'.\n\nThese two spaces naturally define a rule: consumers of compressed IDs should use session-space IDs, but serialized forms such as ops should use op-space IDs.",
  "kind": "Interface",
  "members": {
    "MethodSignature": {
      "decompress": "/docs/apis/id-compressor/iidcompressor-interface#decompress-methodsignature",
      "generateCompressedId": "/docs/apis/id-compressor/iidcompressor-interface#generatecompressedid-methodsignature",
      "normalizeToOpSpace": "/docs/apis/id-compressor/iidcompressor-interface#normalizetoopspace-methodsignature",
      "normalizeToSessionSpace": "/docs/apis/id-compressor/iidcompressor-interface#normalizetosessionspace-methodsignature",
      "recompress": "/docs/apis/id-compressor/iidcompressor-interface#recompress-methodsignature",
      "tryRecompress": "/docs/apis/id-compressor/iidcompressor-interface#tryrecompress-methodsignature"
    },
    "PropertySignature": {
      "localSessionId": "/docs/apis/id-compressor/iidcompressor-interface#localsessionid-propertysignature"
    }
  },
  "package": "@fluidframework/id-compressor",
  "unscopedPackageName": "id-compressor"
}

[//]: # (Do not edit this file. It is automatically generated by @fluidtools/api-markdown-documenter.)

A distributed UUID generator and compressor.

Generates arbitrary non-colliding v4 UUIDs, called stable IDs, for multiple "sessions" (which can be distributed across the network), providing each session with the ability to map these UUIDs to `numbers`.

A session is a unique identifier that denotes a single compressor. New IDs are created through a single compressor API which should then sent in ranges to the server for total ordering (and are subsequently relayed to other clients). When a new ID is created it is said to be created by the compressor's "local" session.

For each stable ID created, two numeric IDs are provided by the compressor:

1. A session-local ID, which is stable for the lifetime of the session (which could be longer than that of the compressor object, as it may be serialized for offline usage). Available as soon as the stable ID is allocated. These IDs are session-unique and are thus only safely usable within the scope of the compressor that created it.

2. A final ID, which is stable across serialization and deserialization of an IdCompressor. Available as soon as the range containing the corresponding session-local ID is totally ordered (via consensus) with respect to other sessions' allocations. Final IDs are known to and publicly usable by any compressor that has received them.

Compressors will allocate UUIDs in non-random ways to reduce entropy allowing for optimized storage of the data needed to map the UUIDs to the numbers.

The following invariants are upheld by IdCompressor:

1. Session-local IDs will always decompress to the same UUIDs for the lifetime of the session.

2. Final IDs will always decompress to the same UUIDs.

3. After a server-processed range of session-local IDs (from any session) is received by a compressor, any of those session-local IDs may be translated by the compressor into the corresponding final ID. For any given session-local ID, this translation will always yield the same final ID.

4. A UUID will always compress into the same session-local ID for the lifetime of the session.

Session-local IDs are sent across the wire in efficiently-represented ranges. These ranges are created by querying the compressor, and \*must\* be ordered (i.e. sent to the server) in the order they are created in order to preserve the above invariants.

Session-local IDs can be used immediately after creation, but will eventually (after being sequenced) have a corresponding final ID. This could make reasoning about equality of those two forms difficult. For example, if a cache is keyed off of a session-local ID but is later queried using the final ID (which is semantically equal, as it decompresses to the same UUID/string) it will produce a cache miss. In order to make using collections of both remotely created and locally created IDs easy, regardless of whether the session-local IDs have been finalized, the compressor defines two "spaces" of IDs:

1. Session space: in this space, all IDs are normalized to their "most local form". This means that all IDs created by the local session will be in local form, regardless of if they have been finalized. Remotely created IDs, which could only have been received after finalizing and will never have a local form for the compressor, will of course be final IDs. This space should be used with consumer APIs and data structures, as the lifetime of the IDs is guaranteed to be the same as the compressor object. Care must be taken to not use these IDs across compressor objects, as the local IDs are specific to the compressor that created them.

2. Op space: in this space, all IDs are normalized to their "most final form". This means that all IDs except session-local IDs that have not yet been finalized will be in final ID form. This space is useful for serialization in ops (e.g. references), as other clients that receive them need not do any work to normalize them to \*their\* session-space in the common case. Note that IDs in op space may move out of Op space over time, namely, when a session-local ID in this space becomes finalized, and thereafter has a "more final form". Consequentially, it may be useful to restrict parameters of a persisted type to this space (to optimize perf), but it is potentially incorrect to use this type for a runtime variable. This is an asymmetry that does not affect session space, as local IDs are always as "local as possible".

These two spaces naturally define a rule: consumers of compressed IDs should use session-space IDs, but serialized forms such as ops should use op-space IDs.

## Signature {#iidcompressor-signature}

```typescript
export interface IIdCompressor
```

## Properties

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Property
      </th>
      <th>
        Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/id-compressor/iidcompressor-interface#localsessionid-propertysignature'>localSessionId</a>
      </td>
      <td>
        <span><a href='/docs/apis/id-compressor#sessionid-typealias'>SessionId</a></span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

## Methods

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Method
      </th>
      <th>
        Return Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/id-compressor/iidcompressor-interface#decompress-methodsignature'>decompress(id)</a>
      </td>
      <td>
        <span><a href='/docs/apis/id-compressor#stableid-typealias'>StableId</a></span>
      </td>
      <td>
        Decompresses a previously compressed ID into a UUID.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/id-compressor/iidcompressor-interface#generatecompressedid-methodsignature'>generateCompressedId()</a>
      </td>
      <td>
        <span><a href='/docs/apis/id-compressor#sessionspacecompressedid-typealias'>SessionSpaceCompressedId</a></span>
      </td>
      <td>
        Generates a new compressed ID or returns an existing one. This should ONLY be called to generate IDs for local operations.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/id-compressor/iidcompressor-interface#normalizetoopspace-methodsignature'>normalizeToOpSpace(id)</a>
      </td>
      <td>
        <span><a href='/docs/apis/id-compressor#opspacecompressedid-typealias'>OpSpaceCompressedId</a></span>
      </td>
      <td>
        Normalizes a session space ID into op space.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/id-compressor/iidcompressor-interface#normalizetosessionspace-methodsignature'>normalizeToSessionSpace(id, originSessionId)</a>
      </td>
      <td>
        <span><a href='/docs/apis/id-compressor#sessionspacecompressedid-typealias'>SessionSpaceCompressedId</a></span>
      </td>
      <td>
        Normalizes an ID into session space.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/id-compressor/iidcompressor-interface#recompress-methodsignature'>recompress(uncompressed)</a>
      </td>
      <td>
        <span><a href='/docs/apis/id-compressor#sessionspacecompressedid-typealias'>SessionSpaceCompressedId</a></span>
      </td>
      <td>
        Recompresses a UUID.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/id-compressor/iidcompressor-interface#tryrecompress-methodsignature'>tryRecompress(uncompressed)</a>
      </td>
      <td>
        <span><a href='/docs/apis/id-compressor#sessionspacecompressedid-typealias'>SessionSpaceCompressedId</a> &#124; undefined</span>
      </td>
      <td>
        Attempts to recompresses a UUID.
      </td>
    </tr>
  </tbody>
</table>

## Property Details

### localSessionId {#localsessionid-propertysignature}

#### Signature {#localsessionid-signature}

```typescript
localSessionId: SessionId;
```

## Method Details

### decompress {#decompress-methodsignature}

Decompresses a previously compressed ID into a UUID.

#### Signature {#decompress-signature}

```typescript
decompress(id: SessionSpaceCompressedId): StableId;
```

#### Parameters {#decompress-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        id
      </td>
      <td>
        <span><a href='/docs/apis/id-compressor#sessionspacecompressedid-typealias'>SessionSpaceCompressedId</a></span>
      </td>
      <td>
        the compressed ID to be decompressed.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#decompress-returns}

the UUID associated with the compressed ID. Fails if the ID was not generated by this compressor.

**Return type:** [StableId](/docs/apis/id-compressor#stableid-typealias)

### generateCompressedId {#generatecompressedid-methodsignature}

Generates a new compressed ID or returns an existing one. This should ONLY be called to generate IDs for local operations.

#### Signature {#generatecompressedid-signature}

```typescript
generateCompressedId(): SessionSpaceCompressedId;
```

#### Returns {#generatecompressedid-returns}

A new local ID in session space.

**Return type:** [SessionSpaceCompressedId](/docs/apis/id-compressor#sessionspacecompressedid-typealias)

### normalizeToOpSpace {#normalizetoopspace-methodsignature}

Normalizes a session space ID into op space.

#### Signature {#normalizetoopspace-signature}

```typescript
normalizeToOpSpace(id: SessionSpaceCompressedId): OpSpaceCompressedId;
```

#### Parameters {#normalizetoopspace-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        id
      </td>
      <td>
        <span><a href='/docs/apis/id-compressor#sessionspacecompressedid-typealias'>SessionSpaceCompressedId</a></span>
      </td>
      <td>
        the local ID to normalize.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#normalizetoopspace-returns}

the ID in op space.

**Return type:** [OpSpaceCompressedId](/docs/apis/id-compressor#opspacecompressedid-typealias)

### normalizeToSessionSpace {#normalizetosessionspace-methodsignature}

Normalizes an ID into session space.

#### Signature {#normalizetosessionspace-signature}

```typescript
normalizeToSessionSpace(id: OpSpaceCompressedId, originSessionId: SessionId): SessionSpaceCompressedId;
```

#### Parameters {#normalizetosessionspace-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        id
      </td>
      <td>
        <span><a href='/docs/apis/id-compressor#opspacecompressedid-typealias'>OpSpaceCompressedId</a></span>
      </td>
      <td>
        the ID to normalize. If it is a local ID, it is assumed to have been created by the session corresponding to <code>sessionId</code>.
      </td>
    </tr>
    <tr>
      <td>
        originSessionId
      </td>
      <td>
        <span><a href='/docs/apis/id-compressor#sessionid-typealias'>SessionId</a></span>
      </td>
      <td>
        the session from which <code>id</code> originated
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#normalizetosessionspace-returns}

the session-space ID corresponding to `id`, which might not have been a final ID if the client that created it had not yet finalized it. This can occur when a client references an ID during the window of time in which it is waiting to receive the ordered range that contained it from the server.

**Return type:** [SessionSpaceCompressedId](/docs/apis/id-compressor#sessionspacecompressedid-typealias)

### recompress {#recompress-methodsignature}

Recompresses a UUID.

#### Signature {#recompress-signature}

```typescript
recompress(uncompressed: StableId): SessionSpaceCompressedId;
```

#### Parameters {#recompress-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        uncompressed
      </td>
      <td>
        <span><a href='/docs/apis/id-compressor#stableid-typealias'>StableId</a></span>
      </td>
      <td>
        the UUID to recompress.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#recompress-returns}

the `CompressedId` associated with `uncompressed`. Fails if it has not been previously compressed by this compressor.

**Return type:** [SessionSpaceCompressedId](/docs/apis/id-compressor#sessionspacecompressedid-typealias)

### tryRecompress {#tryrecompress-methodsignature}

Attempts to recompresses a UUID.

#### Signature {#tryrecompress-signature}

```typescript
tryRecompress(uncompressed: StableId): SessionSpaceCompressedId | undefined;
```

#### Parameters {#tryrecompress-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        uncompressed
      </td>
      <td>
        <span><a href='/docs/apis/id-compressor#stableid-typealias'>StableId</a></span>
      </td>
      <td>
        the UUID to recompress,
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#tryrecompress-returns}

the `CompressedId` associated with `uncompressed` or undefined if it has not been previously compressed by this compressor.

**Return type:** [SessionSpaceCompressedId](/docs/apis/id-compressor#sessionspacecompressedid-typealias) \| undefined

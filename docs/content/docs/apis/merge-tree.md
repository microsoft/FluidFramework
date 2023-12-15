{
  "title": "@fluidframework/merge-tree Package",
  "kind": "Package",
  "members": {
    "Function": {
      "appendToMergeTreeDeltaRevertibles": "/docs/apis/merge-tree#appendtomergetreedeltarevertibles-function",
      "discardMergeTreeDeltaRevertible": "/docs/apis/merge-tree#discardmergetreedeltarevertible-function",
      "revertMergeTreeDeltaRevertibles": "/docs/apis/merge-tree#revertmergetreedeltarevertibles-function"
    },
    "Interface": {
      "AttributionPolicy": "/docs/apis/merge-tree/attributionpolicy-interface",
      "IAttributionCollection": "/docs/apis/merge-tree/iattributioncollection-interface",
      "IAttributionCollectionSerializer": "/docs/apis/merge-tree/iattributioncollectionserializer-interface",
      "IAttributionCollectionSpec": "/docs/apis/merge-tree/iattributioncollectionspec-interface",
      "IClientEvents": "/docs/apis/merge-tree/iclientevents-interface",
      "IJSONMarkerSegment": "/docs/apis/merge-tree/ijsonmarkersegment-interface",
      "IJSONSegment": "/docs/apis/merge-tree/ijsonsegment-interface",
      "IJSONTextSegment": "/docs/apis/merge-tree/ijsontextsegment-interface",
      "IMarkerDef": "/docs/apis/merge-tree/imarkerdef-interface",
      "IMergeNodeCommon": "/docs/apis/merge-tree/imergenodecommon-interface",
      "IMergeTreeAnnotateMsg": "/docs/apis/merge-tree/imergetreeannotatemsg-interface",
      "IMergeTreeAttributionOptions": "/docs/apis/merge-tree/imergetreeattributionoptions-interface",
      "IMergeTreeDelta": "/docs/apis/merge-tree/imergetreedelta-interface",
      "IMergeTreeDeltaCallbackArgs": "/docs/apis/merge-tree/imergetreedeltacallbackargs-interface",
      "IMergeTreeDeltaOpArgs": "/docs/apis/merge-tree/imergetreedeltaopargs-interface",
      "IMergeTreeGroupMsg": "/docs/apis/merge-tree/imergetreegroupmsg-interface",
      "IMergeTreeInsertMsg": "/docs/apis/merge-tree/imergetreeinsertmsg-interface",
      "IMergeTreeMaintenanceCallbackArgs": "/docs/apis/merge-tree/imergetreemaintenancecallbackargs-interface",
      "IMergeTreeObliterateMsg": "/docs/apis/merge-tree/imergetreeobliteratemsg-interface",
      "IMergeTreeOptions": "/docs/apis/merge-tree/imergetreeoptions-interface",
      "IMergeTreeRemoveMsg": "/docs/apis/merge-tree/imergetreeremovemsg-interface",
      "IMergeTreeSegmentDelta": "/docs/apis/merge-tree/imergetreesegmentdelta-interface",
      "IMergeTreeTextHelper": "/docs/apis/merge-tree/imergetreetexthelper-interface",
      "IMoveInfo": "/docs/apis/merge-tree/imoveinfo-interface",
      "IRelativePosition": "/docs/apis/merge-tree/irelativeposition-interface",
      "IRemovalInfo": "/docs/apis/merge-tree/iremovalinfo-interface",
      "ISegment": "/docs/apis/merge-tree/isegment-interface",
      "ISegmentAction": "/docs/apis/merge-tree/isegmentaction-interface",
      "ITrackingGroup": "/docs/apis/merge-tree/itrackinggroup-interface",
      "LocalReferencePosition": "/docs/apis/merge-tree/localreferenceposition-interface",
      "MapLike": "/docs/apis/merge-tree/maplike-interface",
      "MergeTreeRevertibleDriver": "/docs/apis/merge-tree/mergetreerevertibledriver-interface",
      "ReferencePosition": "/docs/apis/merge-tree/referenceposition-interface",
      "SegmentGroup": "/docs/apis/merge-tree/segmentgroup-interface",
      "SequenceOffsets": "/docs/apis/merge-tree/sequenceoffsets-interface",
      "SerializedAttributionCollection": "/docs/apis/merge-tree/serializedattributioncollection-interface"
    },
    "Class": {
      "BaseSegment": "/docs/apis/merge-tree/basesegment-class",
      "Client": "/docs/apis/merge-tree/client-class",
      "CollaborationWindow": "/docs/apis/merge-tree/collaborationwindow-class",
      "LocalReferenceCollection": "/docs/apis/merge-tree/localreferencecollection-class",
      "Marker": "/docs/apis/merge-tree/marker-class",
      "MergeNode": "/docs/apis/merge-tree/mergenode-class",
      "PropertiesManager": "/docs/apis/merge-tree/propertiesmanager-class",
      "SegmentGroupCollection": "/docs/apis/merge-tree/segmentgroupcollection-class",
      "TextSegment": "/docs/apis/merge-tree/textsegment-class",
      "TrackingGroup": "/docs/apis/merge-tree/trackinggroup-class",
      "TrackingGroupCollection": "/docs/apis/merge-tree/trackinggroupcollection-class"
    },
    "TypeAlias": {
      "IMergeTreeDeltaOp": "/docs/apis/merge-tree#imergetreedeltaop-typealias",
      "IMergeTreeOp": "/docs/apis/merge-tree#imergetreeop-typealias",
      "MergeTreeDeltaOperationType": "/docs/apis/merge-tree#mergetreedeltaoperationtype-typealias",
      "MergeTreeDeltaOperationTypes": "/docs/apis/merge-tree#mergetreedeltaoperationtypes-typealias",
      "MergeTreeDeltaRevertible": "/docs/apis/merge-tree#mergetreedeltarevertible-typealias",
      "MergeTreeDeltaType": "/docs/apis/merge-tree#mergetreedeltatype-typealias",
      "MergeTreeMaintenanceType": "/docs/apis/merge-tree#mergetreemaintenancetype-typealias",
      "PropertySet": "/docs/apis/merge-tree#propertyset-typealias",
      "SlidingPreference": "/docs/apis/merge-tree#slidingpreference-typealias",
      "Trackable": "/docs/apis/merge-tree#trackable-typealias"
    },
    "Variable": {
      "MergeTreeDeltaType": "/docs/apis/merge-tree#mergetreedeltatype-variable",
      "MergeTreeMaintenanceType": "/docs/apis/merge-tree#mergetreemaintenancetype-variable",
      "SlidingPreference": "/docs/apis/merge-tree#slidingpreference-variable"
    },
    "Enum": {
      "PropertiesRollback": "/docs/apis/merge-tree/propertiesrollback-enum",
      "ReferenceType": "/docs/apis/merge-tree/referencetype-enum"
    }
  },
  "package": "@fluidframework/merge-tree",
  "unscopedPackageName": "merge-tree"
}

[//]: # (Do not edit this file. It is automatically generated by @fluidtools/api-markdown-documenter.)

## Interfaces

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Interface
      </th>
      <th>
        Alerts
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/attributionpolicy-interface'>AttributionPolicy</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>sealed</code>
      </td>
      <td>
        Implements policy dictating which kinds of operations should be attributed and how.
        <br>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/iattributioncollection-interface'>IAttributionCollection</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/iattributioncollectionserializer-interface'>IAttributionCollectionSerializer</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>sealed</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/iattributioncollectionspec-interface'>IAttributionCollectionSpec</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/iclientevents-interface'>IClientEvents</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Emitted before this client's merge-tree normalizes its segments on reconnect, potentially ordering them. Useful for DDS-like consumers built atop the merge-tree to compute any information they need for rebasing their ops on reconnection.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/ijsonmarkersegment-interface'>IJSONMarkerSegment</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/ijsonsegment-interface'>IJSONSegment</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/ijsontextsegment-interface'>IJSONTextSegment</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/imarkerdef-interface'>IMarkerDef</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/imergenodecommon-interface'>IMergeNodeCommon</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Common properties for a node in a merge tree.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/imergetreeannotatemsg-interface'>IMergeTreeAnnotateMsg</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/imergetreeattributionoptions-interface'>IMergeTreeAttributionOptions</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/imergetreedelta-interface'>IMergeTreeDelta</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/imergetreedeltacallbackargs-interface'>IMergeTreeDeltaCallbackArgs</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/imergetreedeltaopargs-interface'>IMergeTreeDeltaOpArgs</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/imergetreegroupmsg-interface'>IMergeTreeGroupMsg</a>
      </td>
      <td>
        <code>ALPHA</code>, <code>DEPRECATED</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/imergetreeinsertmsg-interface'>IMergeTreeInsertMsg</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/imergetreemaintenancecallbackargs-interface'>IMergeTreeMaintenanceCallbackArgs</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/imergetreeobliteratemsg-interface'>IMergeTreeObliterateMsg</a>
      </td>
      <td>
        <code>ALPHA</code>, <code>DEPRECATED</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/imergetreeoptions-interface'>IMergeTreeOptions</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/imergetreeremovemsg-interface'>IMergeTreeRemoveMsg</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/imergetreesegmentdelta-interface'>IMergeTreeSegmentDelta</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/imergetreetexthelper-interface'>IMergeTreeTextHelper</a>
      </td>
      <td>
        <code>ALPHA</code>, <code>DEPRECATED</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/imoveinfo-interface'>IMoveInfo</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        <p>
          Tracks information about when and where this segment was moved to.
        </p>
        <p>
          Note that merge-tree does not currently support moving and only supports obliterate. The fields below include &quot;move&quot; in their names to avoid renaming in the future, when moves _are_ supported.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/irelativeposition-interface'>IRelativePosition</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        A position specified relative to a segment.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/iremovalinfo-interface'>IRemovalInfo</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Contains removal information associated to an <a href='/docs/apis/merge-tree/isegment-interface'>ISegment</a>.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/isegment-interface'>ISegment</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        A segment representing a portion of the merge tree. Segments are leaf nodes of the merge tree and contain data.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/isegmentaction-interface'>ISegmentAction</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/itrackinggroup-interface'>ITrackingGroup</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/localreferenceposition-interface'>LocalReferencePosition</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>sealed</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/maplike-interface'>MapLike</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Any mapping from a string to values of type <code>T</code>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/mergetreerevertibledriver-interface'>MergeTreeRevertibleDriver</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/referenceposition-interface'>ReferencePosition</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
        Represents a reference to a place within a merge tree. This place conceptually remains stable over time by referring to a particular segment and offset within that segment. Thus, this reference's character position changes as the tree is edited.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/segmentgroup-interface'>SegmentGroup</a>
      </td>
      <td>
        <code>ALPHA</code>, <code>DEPRECATED</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/sequenceoffsets-interface'>SequenceOffsets</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/serializedattributioncollection-interface'>SerializedAttributionCollection</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

## Classes

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Class
      </th>
      <th>
        Alerts
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/basesegment-class'>BaseSegment</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/client-class'>Client</a>
      </td>
      <td>
        <code>ALPHA</code>, <code>DEPRECATED</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/collaborationwindow-class'>CollaborationWindow</a>
      </td>
      <td>
        <code>ALPHA</code>, <code>DEPRECATED</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/localreferencecollection-class'>LocalReferenceCollection</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Represents a collection of <a href='/docs/apis/merge-tree/localreferenceposition-interface'>LocalReferencePosition</a>s associated with one segment in a merge-tree. Represents a collection of <a href='/docs/apis/merge-tree/localreferenceposition-interface'>LocalReferencePosition</a>s associated with one segment in a merge-tree.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/marker-class'>Marker</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <p>
          Markers are a special kind of segment that do not hold any content.
        </p>
        <p>
          Markers with a reference type of <a href='/docs/apis/merge-tree/referencetype-enum#tile-enummember'>Tile</a> support spatially accelerated queries for finding the next marker to the left or right of it in sub-linear time. This is useful, for example, in the case of jumping from the start of a paragraph to the end, assuming a paragraph is bound by markers at the start and end.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/mergenode-class'>MergeNode</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/propertiesmanager-class'>PropertiesManager</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/segmentgroupcollection-class'>SegmentGroupCollection</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/textsegment-class'>TextSegment</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/trackinggroup-class'>TrackingGroup</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/trackinggroupcollection-class'>TrackingGroupCollection</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        A collection of <a href='/docs/apis/merge-tree/itrackinggroup-interface'>ITrackingGroup</a>.
      </td>
    </tr>
  </tbody>
</table>

## Enumerations

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Enum
      </th>
      <th>
        Alerts
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/propertiesrollback-enum'>PropertiesRollback</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree/referencetype-enum'>ReferenceType</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Flags enum that dictates behavior of a <a href='/docs/apis/merge-tree/referenceposition-interface'>ReferencePosition</a>
      </td>
    </tr>
  </tbody>
</table>

## Types

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        TypeAlias
      </th>
      <th>
        Alerts
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree#imergetreedeltaop-typealias'>IMergeTreeDeltaOp</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree#imergetreeop-typealias'>IMergeTreeOp</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree#mergetreedeltaoperationtype-typealias'>MergeTreeDeltaOperationType</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree#mergetreedeltaoperationtypes-typealias'>MergeTreeDeltaOperationTypes</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree#mergetreedeltarevertible-typealias'>MergeTreeDeltaRevertible</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree#mergetreedeltatype-typealias'>MergeTreeDeltaType</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree#mergetreemaintenancetype-typealias'>MergeTreeMaintenanceType</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree#propertyset-typealias'>PropertySet</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        A loosely-typed mapping from strings to any value.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree#slidingpreference-typealias'>SlidingPreference</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Dictates the preferential direction for a <a href='/docs/apis/merge-tree/referenceposition-interface'>ReferencePosition</a> to slide in a merge-tree
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree#trackable-typealias'>Trackable</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

## Functions

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Function
      </th>
      <th>
        Alerts
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
        <a href='/docs/apis/merge-tree#appendtomergetreedeltarevertibles-function'>appendToMergeTreeDeltaRevertibles(deltaArgs, revertibles)</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree#discardmergetreedeltarevertible-function'>discardMergeTreeDeltaRevertible(revertibles)</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree#revertmergetreedeltarevertibles-function'>revertMergeTreeDeltaRevertibles(driver, revertibles)</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

## Variables

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Variable
      </th>
      <th>
        Alerts
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree#mergetreedeltatype-variable'>MergeTreeDeltaType</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree#mergetreemaintenancetype-variable'>MergeTreeMaintenanceType</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <p>
          Enum-like constant defining the types of &quot;maintenance&quot; events on a merge tree. Maintenance events correspond to structural segment changes or acks of pending segments.
        </p>
        <p>
          Note: these values are assigned negative integers to avoid clashing with <code>MergeTreeDeltaType</code>.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/merge-tree#slidingpreference-variable'>SlidingPreference</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        Dictates the preferential direction for a <a href='/docs/apis/merge-tree/referenceposition-interface'>ReferencePosition</a> to slide in a merge-tree
      </td>
    </tr>
  </tbody>
</table>

## Type Details

### IMergeTreeDeltaOp (ALPHA) {#imergetreedeltaop-typealias}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#imergetreedeltaop-signature}

```typescript
export type IMergeTreeDeltaOp = IMergeTreeInsertMsg | IMergeTreeRemoveMsg | IMergeTreeAnnotateMsg | IMergeTreeObliterateMsg;
```

### IMergeTreeOp (ALPHA) {#imergetreeop-typealias}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#imergetreeop-signature}

```typescript
export type IMergeTreeOp = IMergeTreeDeltaOp | IMergeTreeGroupMsg;
```

### MergeTreeDeltaOperationType (ALPHA) {#mergetreedeltaoperationtype-typealias}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#mergetreedeltaoperationtype-signature}

```typescript
export type MergeTreeDeltaOperationType = typeof MergeTreeDeltaType.ANNOTATE | typeof MergeTreeDeltaType.INSERT | typeof MergeTreeDeltaType.REMOVE | typeof MergeTreeDeltaType.OBLITERATE;
```

### MergeTreeDeltaOperationTypes (ALPHA) {#mergetreedeltaoperationtypes-typealias}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#mergetreedeltaoperationtypes-signature}

```typescript
export type MergeTreeDeltaOperationTypes = MergeTreeDeltaOperationType | MergeTreeMaintenanceType;
```

### MergeTreeDeltaRevertible (ALPHA) {#mergetreedeltarevertible-typealias}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#mergetreedeltarevertible-signature}

```typescript
export type MergeTreeDeltaRevertible = {
    operation: typeof MergeTreeDeltaType.INSERT;
    trackingGroup: ITrackingGroup;
} | {
    operation: typeof MergeTreeDeltaType.REMOVE;
    trackingGroup: ITrackingGroup;
} | {
    operation: typeof MergeTreeDeltaType.ANNOTATE;
    trackingGroup: ITrackingGroup;
    propertyDeltas: PropertySet;
};
```

### MergeTreeDeltaType (ALPHA) {#mergetreedeltatype-typealias}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#mergetreedeltatype-signature}

```typescript
export type MergeTreeDeltaType = (typeof MergeTreeDeltaType)[keyof typeof MergeTreeDeltaType];
```

### MergeTreeMaintenanceType (ALPHA) {#mergetreemaintenancetype-typealias}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#mergetreemaintenancetype-signature}

```typescript
export type MergeTreeMaintenanceType = (typeof MergeTreeMaintenanceType)[keyof typeof MergeTreeMaintenanceType];
```

### PropertySet (ALPHA) {#propertyset-typealias}

A loosely-typed mapping from strings to any value.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#propertyset-signature}

```typescript
export type PropertySet = MapLike<any>;
```

#### Remarks {#propertyset-remarks}

Property sets are expected to be JSON-stringify-able.

### SlidingPreference (ALPHA) {#slidingpreference-typealias}

Dictates the preferential direction for a [ReferencePosition](/docs/apis/merge-tree/referenceposition-interface) to slide in a merge-tree

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#slidingpreference-signature}

```typescript
export type SlidingPreference = (typeof SlidingPreference)[keyof typeof SlidingPreference];
```

### Trackable (ALPHA) {#trackable-typealias}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#trackable-signature}

```typescript
export type Trackable = ISegment | LocalReferencePosition;
```

## Function Details

### appendToMergeTreeDeltaRevertibles (ALPHA) {#appendtomergetreedeltarevertibles-function}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#appendtomergetreedeltarevertibles-signature}

```typescript
export declare function appendToMergeTreeDeltaRevertibles(deltaArgs: IMergeTreeDeltaCallbackArgs, revertibles: MergeTreeDeltaRevertible[]): void;
```

#### Parameters {#appendtomergetreedeltarevertibles-parameters}

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
        deltaArgs
      </td>
      <td>
        <span><a href='/docs/apis/merge-tree/imergetreedeltacallbackargs-interface'>IMergeTreeDeltaCallbackArgs</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        revertibles
      </td>
      <td>
        <span><a href='/docs/apis/merge-tree#mergetreedeltarevertible-typealias'>MergeTreeDeltaRevertible</a>[]</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

### discardMergeTreeDeltaRevertible (ALPHA) {#discardmergetreedeltarevertible-function}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#discardmergetreedeltarevertible-signature}

```typescript
export declare function discardMergeTreeDeltaRevertible(revertibles: MergeTreeDeltaRevertible[]): void;
```

#### Parameters {#discardmergetreedeltarevertible-parameters}

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
        revertibles
      </td>
      <td>
        <span><a href='/docs/apis/merge-tree#mergetreedeltarevertible-typealias'>MergeTreeDeltaRevertible</a>[]</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

### revertMergeTreeDeltaRevertibles (ALPHA) {#revertmergetreedeltarevertibles-function}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#revertmergetreedeltarevertibles-signature}

```typescript
export declare function revertMergeTreeDeltaRevertibles(driver: MergeTreeRevertibleDriver, revertibles: MergeTreeDeltaRevertible[]): void;
```

#### Parameters {#revertmergetreedeltarevertibles-parameters}

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
        driver
      </td>
      <td>
        <span><a href='/docs/apis/merge-tree/mergetreerevertibledriver-interface'>MergeTreeRevertibleDriver</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        revertibles
      </td>
      <td>
        <span><a href='/docs/apis/merge-tree#mergetreedeltarevertible-typealias'>MergeTreeDeltaRevertible</a>[]</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

## Variable Details

### MergeTreeDeltaType (ALPHA) {#mergetreedeltatype-variable}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#mergetreedeltatype-signature}

```typescript
MergeTreeDeltaType: {
    readonly INSERT: 0;
    readonly REMOVE: 1;
    readonly ANNOTATE: 2;
    readonly GROUP: 3;
    readonly OBLITERATE: 4;
}
```

### MergeTreeMaintenanceType (ALPHA) {#mergetreemaintenancetype-variable}

Enum-like constant defining the types of "maintenance" events on a merge tree. Maintenance events correspond to structural segment changes or acks of pending segments.

Note: these values are assigned negative integers to avoid clashing with `MergeTreeDeltaType`.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#mergetreemaintenancetype-signature}

```typescript
MergeTreeMaintenanceType: {
    readonly APPEND: -1;
    readonly SPLIT: -2;
    readonly UNLINK: -3;
    readonly ACKNOWLEDGED: -4;
}
```

### SlidingPreference (ALPHA) {#slidingpreference-variable}

Dictates the preferential direction for a [ReferencePosition](/docs/apis/merge-tree/referenceposition-interface) to slide in a merge-tree

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#slidingpreference-signature}

```typescript
SlidingPreference: {
    readonly BACKWARD: 0;
    readonly FORWARD: 1;
}
```

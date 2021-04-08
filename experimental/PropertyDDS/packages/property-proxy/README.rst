PropertyTree Proxy
=======================

Overview
--------

The proxy allows interaction with properties as if they were common
JavaScript objects. In general every property that can be mapped in a
reasonable manner to a native JavaScript object is mapped in that way.
For example, interaction with a proxied ArrayProperty feels like working
with an JavaScript array. All functions and access patters that can be
used on a JavaScript array are available.

Any modification is directly applied to the data in PropertyDDS without caching
data locally and data is loaded lazily on access.

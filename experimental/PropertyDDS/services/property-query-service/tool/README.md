# Fire drill tools
Tools that should be useful in the context of an MHS fire drill or real PITR scenario.

## Get MH branch assignation
Gets the MHS instance assigned for a branch from Redis.

### Configuration
Complete the `hfdmRedis` section in [settings.json](../config/settings.json) with your environment settings.

### Usage
```
node get_mh_instance_for_branch.js "<BRANCH_GUID>"
```

## MH consistency repair after PITR
Restores MH for branches back to consistency, based on the information available in HFDM classic.

### Configuration
Complete the `store-dynamodb` section in [DynamoDB settings](../../../libs/dynamodb_store/config/settings.json) with your environment settings.
Complete the `store-dynamodb`, `s3Store` and `binary` sections in [settings.json](../config/settings.json) with your environment settings.
In order to get meaningful output from the tool, it is recommended to set the log level to `TRACE` in [RepairManager](repair/repair_manager.js).

### Usage
```
node repair/runner.js -s "<PITR_ISO_DATE>" -p 10
```

# Branch export/import tools
Allow to export data from MH in one environment and import it into another one.

## Dump branch MHS data
Dumps all available data for a branch in MHS to a JSON file.

### Configuration
Complete the `store-dynamodb` section in [DynamoDB settings](../../../libs/dynamodb_store/config/settings.json) with your environment settings.
Complete the `store-dynamodb`, `s3Store` and `binary` sections in [settings.json](../config/settings.json) with your environment settings.

### Usage
```
node branch_dump/dump_branch.js -b "<BRANCH_GUID>" -o "<OUTPUT_FILE>"
```

## Import branch MHS data
Imports branch data obtained from a previous dump into MHS.

### Configuration
Complete the `store-dynamodb` section in [DynamoDB settings](../../../libs/dynamodb_store/config/settings.json) with your environment settings.
Complete the `store-dynamodb`, `s3Store` and `binary` sections in [settings.json](../config/settings.json) with your environment settings.

### Usage
```
node branch_dump/import_branch.js -i "<INPUT_FILE>"
```

# REST querying tools
Simple tools that allow to get useful information from MHS.
Note: These tools only allow using a local server.

## Get branch
Gets the meta node for a branch, which contains general branch information.

### Usage
```
node rest/get_branch.js -b "<BRANCH_GUID>"
```

## Get commit
Gets the meta node for a commit, which contains general commit information.

### Usage
```
node rest/get_commit.js -b "<BRANCH_GUID>" -c "<COMMIT_GUID>
```

## Get commit with change set
Gets the meta node for a commit including also its change set.

### Usage
```
node rest/get_commit_with_cs.js -b "<BRANCH_GUID>" -c "<COMMIT_GUID>
```

## Get materialized view
Gets the full materialized view for a branch at a certain commit.

### Usage
```
node rest/get_mv.js -b "<BRANCH_GUID>" -c "<COMMIT_GUID>
```

# Commit replaying tools
This set of tools is useful for getting commits out from HFDM and replaying them in another environment.

## Get commits from REST API
Exports the commits of a branch using the HFDM REST API. Commits are written to independent files by sequence number.

### Configuration
By default runs against a local stack. Can be configured to use other environments using options `-s` and `-t`.

### Usage
```
node replay/get_commit_range.js -b "<BRANCH_GUID>"
```

## Find commits by text in MHS
Allows to search commits that contain a specified text in its change sets. Matching commits are output to console.

### Configuration
Only allows to run against a local MHS.

### Usage
```
node replay/grep_commits.js -b "<BRANCH_GUID>" -c "<COMMIT_GUID> -s "<SEARCH_STRING>"
```

## Dump a workspace
Pretty prints the content of a workspace to console using the SDK.

### Configuration
By default runs against a local stack. Can be configured to use other environments using options `-a` and `-t`.

### Usage
```
node replay/dump_workspace.js -b "<BRANCH_URN>"
```

## Ingest commits using the SDK
Creates a new MH enabled workspace and imports commits into it using the SDK. Used in conjunction with [this tool](#Get-commits-from-REST-API).

### Configuration
By default runs against a local stack. Can be configured to use other environments using options `-a` and `-t`.

### Usage
```
node replay/ingest_sdk.js
```

## Ingest commits using MHS
Creates a branch in MHS and imports commits into it directly. Used in conjunction with [this tool](#Get-commits-from-REST-API).

### Configuration
Only allows to run against a local MHS.

### Usage
```
node replay/ingest_mhs.js -b "<BRANCH_GUID>" -c "<ROOT_COMMIT_GUID>"
```

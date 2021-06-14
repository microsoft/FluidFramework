local branch_id = ARGV[1];
local pss_id = ARGV[2];
local cluster = ARGV[3];

local assigned_pss_for_branch = redis.call("HGET", "{BA}:PSS_BRANCH_ASSIGNATIONS", branch_id);

if assigned_pss_for_branch == pss_id or assigned_pss_for_branch == "UNAVAILABLE" .. pss_id  or assigned_pss_for_branch == "SHUTTINGDOWN" .. pss_id  then
	redis.call("HDEL", "{BA}:PSS_BRANCH_ASSIGNATIONS", branch_id)
end

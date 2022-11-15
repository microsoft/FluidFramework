local branch_id = ARGV[1];
local mh_id = ARGV[2];

local assigned_pss_for_branch = redis.call("HGET", "{BAMH}:MH_BRANCH_ASSIGNATIONS", branch_id);

if assigned_pss_for_branch == mh_id or assigned_pss_for_branch == "UNAVAILABLE" .. mh_id  or assigned_pss_for_branch == "SHUTTINGDOWN" .. mh_id  then
	redis.call("HDEL", "{BAMH}:MH_BRANCH_ASSIGNATIONS", branch_id)
end

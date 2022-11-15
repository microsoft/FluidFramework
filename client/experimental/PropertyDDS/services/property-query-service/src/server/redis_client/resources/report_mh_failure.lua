local branch_id = ARGV[1];
local mh_id = ARGV[2];
local broker_id = ARGV[3];
local this_minute = tonumber(ARGV[4]);
local current_second = tonumber(ARGV[5]);

local failure_set = "{BAMH}:MHUSER_MH_FAILURES:" .. mh_id

local broker_instance_minute = nil
local pss_for_branch = nil

local hgetall = function (key)
  local bulk = redis.call("HGETALL", key)
	local result = {}
	local nextkey
	for i, v in ipairs(bulk) do
		if i % 2 == 1 then
			nextkey = v
		else
			result[nextkey] = v
		end
	end
	return result
end

if branch_id ~= '' then
    pss_for_branch = redis.call("HGET", "{BAMH}:MH_BRANCH_ASSIGNATIONS", branch_id)

    if(pss_for_branch ~= mh_id) then
        if pss_for_branch ~= false then
            return pss_for_branch
        else
            local lowest_load_instance = redis.call("ZRANGE", "{BAMH}:MH_INSTANCES", 0, 0)[1]
            redis.call("HMSET", "{BAMH}:MH_BRANCH_ASSIGNATIONS", branch_id, lowest_load_instance)
            return lowest_load_instance
        end
    end
end

redis.call("SADD", failure_set, broker_id)

-- Let time for all brokers to register.  If it's under second
-- 10 in the minute, poke the previous minute to get the
-- total number of voters.
if current_second < 10 then
    broker_instance_minute = tostring(this_minute - 60000)
else
    broker_instance_minute = tostring(this_minute)
end

local broker_instance_set = "{BAMH}:MHUSER_INSTANCES:" .. broker_instance_minute

local failures_for_pss_count = redis.call("SINTERSTORE", failure_set, failure_set, broker_instance_set)
local broker_count = redis.call("SCARD", broker_instance_set)
local pss_count = redis.call("ZCARD", "{BAMH}:MH_INSTANCES")

local majority_reached = pss_count > 1 and (failures_for_pss_count / broker_count) > 0.5

if majority_reached then

    -- TODO: Mabye do this, to reduce memory usage of the Lua script
    -- http://danoyoung.blogspot.ca/2015/12/lua-scripting-with-redis.html, but with HSCAN
    local assignations = hgetall("{BAMH}:MH_BRANCH_ASSIGNATIONS")

    for i_branch_id, i_mh_id in pairs(assignations) do
        if i_mh_id == mh_id then
            redis.call("HSET", "{BAMH}:MH_BRANCH_ASSIGNATIONS", i_branch_id, "UNAVAILABLE" .. mh_id)
        end
    end

    redis.call("SADD", "{BAMH}:MH_INSTANCES_DYING", mh_id)
    redis.call("ZREM", "{BAMH}:MH_INSTANCES", mh_id)
    redis.call("DEL", failure_set)

    return nil
else
    return nil
end

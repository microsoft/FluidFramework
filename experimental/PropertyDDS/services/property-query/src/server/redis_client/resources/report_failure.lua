local branch_id = ARGV[1];
local pss_id = ARGV[2];
local broker_id = ARGV[3];
local this_minute = tonumber(ARGV[4]);
local current_second = tonumber(ARGV[5]);
local cluster = ARGV[6];

local failure_set = "{BA}:BROKER_PSS_FAILURES:" .. pss_id

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
    pss_for_branch = redis.call("HGET", "{BA}:PSS_BRANCH_ASSIGNATIONS", branch_id)

    if(pss_for_branch ~= pss_id) then
        if pss_for_branch ~= false then
            return pss_for_branch
        else
            local lowest_load_instance = redis.call("ZRANGE", "{BA}:PSS_INSTANCES", 0, 0)[1]
            redis.call("HMSET", "{BA}:PSS_BRANCH_ASSIGNATIONS", branch_id, lowest_load_instance)
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

local broker_instance_set = "{BA}:BROKER_INSTANCES:" .. broker_instance_minute

local failures_for_pss_count = redis.call("SINTERSTORE", failure_set, failure_set, broker_instance_set)
local broker_count = redis.call("SCARD", broker_instance_set)
local pss_count = redis.call("ZCARD", "{BA}:PSS_INSTANCES")

local majority_reached = pss_count > 1 and (failures_for_pss_count / broker_count) > 0.5

if majority_reached then

    -- TODO: Mabye do this, to reduce memory usage of the Lua script
    -- http://danoyoung.blogspot.ca/2015/12/lua-scripting-with-redis.html, but with HSCAN
    local assignations = hgetall("{BA}:PSS_BRANCH_ASSIGNATIONS")

    for i_branch_id, i_pss_id in pairs(assignations) do
        if i_pss_id == pss_id then
            redis.call("HSET", "{BA}:PSS_BRANCH_ASSIGNATIONS", i_branch_id, "UNAVAILABLE" .. pss_id)
        end
    end

    redis.call("SADD", "{BA}:PSS_INSTANCES_DYING", pss_id)
    redis.call("ZREM", "{BA}:PSS_INSTANCES", pss_id)
    redis.call("DEL", failure_set)
    return nil
else
    return nil
end

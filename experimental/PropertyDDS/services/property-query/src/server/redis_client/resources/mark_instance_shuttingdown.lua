local pss_id = ARGV[1];
local cluster = ARGV[2];

local failure_set = "{BA}:BROKER_PSS_FAILURES:" .. pss_id

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

-- TODO: Maybe do this, to reduce memory usage of the Lua script
-- http://danoyoung.blogspot.ca/2015/12/lua-scripting-with-redis.html, but with HSCAN
local assignations = hgetall("{BA}:PSS_BRANCH_ASSIGNATIONS")

for i_branch_id, i_pss_id in pairs(assignations) do
    if i_pss_id == pss_id then
        redis.call("HMSET", "{BA}:PSS_BRANCH_ASSIGNATIONS", i_branch_id, "SHUTTINGDOWN" .. pss_id)
    end
end

redis.call("SADD", "{BA}:PSS_INSTANCES_SHUTTINGDOWN", pss_id)
redis.call("ZREM", "{BA}:PSS_INSTANCES", pss_id)
redis.call("DEL", failure_set);

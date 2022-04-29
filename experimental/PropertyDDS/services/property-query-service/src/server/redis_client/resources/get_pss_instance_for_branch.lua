local branch_id = ARGV[1]
local cluster = ARGV[2];

local updateLoad = function (instance, load)
    redis.call("ZADD", "{BA}:PSS_INSTANCES", load, instance)
    redis.call("SETEX", "{BA}:PSS_LIVELINESS:" .. instance, 60, load)
end

if cluster == "false" then
    local existing_assignation = redis.call("HGET", "{BA}:PSS_BRANCH_ASSIGNATIONS", branch_id)
    if existing_assignation ~= false then
        return existing_assignation
    else
        local lowest_load_instance, load = unpack(redis.call("ZRANGE", "{BA}:PSS_INSTANCES", 0, 0, "WITHSCORES"))
        if lowest_load_instance then
            redis.call("HMSET", "{BA}:PSS_BRANCH_ASSIGNATIONS", branch_id, lowest_load_instance)
            updateLoad(lowest_load_instance, load + 1)
        end
        return lowest_load_instance
    end
else
    local existing_assignation = redis.call("HGET", "{BA}:PSS_BRANCH_ASSIGNATIONS", branch_id)
    if existing_assignation ~= false then
        return existing_assignation
    else
        local lowest_load_instance, load = unpack(redis.call("ZRANGE", "{BA}:PSS_INSTANCES", 0, 0, "WITHSCORES"))
        if lowest_load_instance then
            redis.call("HMSET", "{BA}:PSS_BRANCH_ASSIGNATIONS", branch_id, lowest_load_instance)

            updateLoad(lowest_load_instance, load + 1)
        end
        return lowest_load_instance
    end
end

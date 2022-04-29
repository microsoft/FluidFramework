local branch_id = ARGV[1]

local existing_assignation = redis.call("HGET", "{BAMH}:MH_BRANCH_ASSIGNATIONS", branch_id)
if existing_assignation ~= false then
    return existing_assignation
else
    local lowest_load_instance = redis.call("ZRANGE", "{BAMH}:MH_INSTANCES", 0, 0)[1]
    if lowest_load_instance then
        redis.call("HMSET", "{BAMH}:MH_BRANCH_ASSIGNATIONS", branch_id, lowest_load_instance)
    end
    return lowest_load_instance
end

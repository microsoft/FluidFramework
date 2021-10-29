local pss_id = ARGV[1];
local load = ARGV[2];
local cluster = ARGV[3];

local is_pss_dying = redis.call("SISMEMBER", "{BA}:PSS_INSTANCES_DYING", pss_id);
local is_pss_shuttingdown = redis.call("SISMEMBER", "{BA}:PSS_INSTANCES_SHUTTINGDOWN", pss_id);

if is_pss_dying == 0 and is_pss_shuttingdown == 0 then
    redis.call("ZADD", "{BA}:PSS_INSTANCES", load, pss_id)
    redis.call("SETEX", "{BA}:PSS_LIVELINESS:" .. pss_id, 60, load);
end

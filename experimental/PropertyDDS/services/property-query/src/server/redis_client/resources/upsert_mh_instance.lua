local pss_id = ARGV[1];
local load = ARGV[2];

local is_pss_dying = redis.call("SISMEMBER", "{BAMH}:MH_INSTANCES_DYING", pss_id);
local is_pss_shuttingdown = redis.call("SISMEMBER", "{BAMH}:MH_INSTANCES_SHUTTINGDOWN", pss_id);

if is_pss_dying == 0 and is_pss_shuttingdown == 0 then
    redis.call("ZADD", "{BAMH}:MH_INSTANCES", load, pss_id)
    redis.call("SETEX", "{BAMH}:MH_LIVELINESS:" .. pss_id, 60, load);
end

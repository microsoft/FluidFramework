local pss_id = ARGV[1];
local cluster = ARGV[2];

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

-- TODO: Mabye do this, to reduce memory usage of the Lua script
-- http://danoyoung.blogspot.ca/2015/12/lua-scripting-with-redis.html, but with HSCAN
local assignations = hgetall("{BA}:PSS_BRANCH_ASSIGNATIONS")

for i_branch_id, i_pss_id in pairs(assignations) do
    if i_pss_id == pss_id or i_pss_id == "UNAVAILABLE" .. pss_id or i_pss_id == "SHUTTINGDOWN" .. pss_id then
        redis.call("HDEL", "{BA}:PSS_BRANCH_ASSIGNATIONS", i_branch_id)
    end
end

redis.call("SREM", "{BA}:PSS_INSTANCES_DYING", pss_id)
redis.call("SREM", "{BA}:PSS_INSTANCES_SHUTTINGDOWN", pss_id)
redis.call("DEL", "{BA}:PSS_LIVELINESS:" .. pss_id)

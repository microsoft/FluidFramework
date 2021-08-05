local mh_id = ARGV[1];

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
local assignations = hgetall("{BAMH}:MH_BRANCH_ASSIGNATIONS")

for i_branch_id, i_mh_id in pairs(assignations) do
    if i_mh_id == mh_id or i_mh_id == "UNAVAILABLE" .. mh_id or i_mh_id == "SHUTTINGDOWN" .. mh_id then
        redis.call("HDEL", "{BAMH}:MH_BRANCH_ASSIGNATIONS", i_branch_id)
    end
end

redis.call("ZREM", "{BAMH}:MH_INSTANCES", mh_id)
redis.call("SREM", "{BAMH}:MH_INSTANCES_DYING", mh_id)
redis.call("SREM", "{BAMH}:MH_INSTANCES_SHUTTINGDOWN", mh_id)
redis.call("DEL", "{BAMH}:MHUSER_MH_FAILURES:" .. mh_id)
redis.call("DEL", "{BAMH}:MH_LIVELINESS:" .. mh_id)

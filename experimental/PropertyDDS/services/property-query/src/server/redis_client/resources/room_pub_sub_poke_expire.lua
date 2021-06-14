local collaborator_key = KEYS[1];
local room_key = KEYS[2];
local lifetime = ARGV[1];
local score = ARGV[2];

local res = redis.call("EXPIRE", collaborator_key, lifetime);
redis.call("EXPIRE", room_key, lifetime);
redis.call("ZADD", room_key, 'XX', score, collaborator_key);

return res;

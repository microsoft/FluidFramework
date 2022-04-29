local collaborator_key = KEYS[1];
local room_key = KEYS[2];
local lifetime = ARGV[1];
local score = ARGV[2];

redis.call("SETEX", collaborator_key, lifetime, 1);
redis.call("ZADD", room_key, score, collaborator_key);
redis.call("EXPIRE", room_key, lifetime);
redis.call("PUBLISH", collaborator_key, "set");

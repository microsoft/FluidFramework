local collaborator_key = KEYS[1];
local room_key = KEYS[2];

redis.call("DEL", collaborator_key);
redis.call("ZREM", room_key, collaborator_key);
redis.call("PUBLISH", collaborator_key, "del");

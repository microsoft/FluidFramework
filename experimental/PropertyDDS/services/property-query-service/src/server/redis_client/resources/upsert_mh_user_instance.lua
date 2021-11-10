local this_minute_broker_set = ARGV[1];
local broker_id = ARGV[2];
local expiry = ARGV[3];

redis.call("SADD", this_minute_broker_set, broker_id);
redis.call("EXPIREAT", this_minute_broker_set, expiry);

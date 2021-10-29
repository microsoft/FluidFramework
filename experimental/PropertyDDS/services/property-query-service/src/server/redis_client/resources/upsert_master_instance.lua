-- A "master" is one machine from a group which won a race. The idea is to have multiple
-- instances of a type of workers and one wins the race to be the master.
local worker_type = "{" .. KEYS[1] .. "}";
local worker_id = ARGV[1];
local lifetime = tonumber(ARGV[2]);
local cluster = ARGV[3];

local current_worker = redis.call("GET", worker_type);

 if cluster == "false" then
    if current_worker then
      if current_worker == worker_id then
        redis.call("EXPIRE", worker_type, lifetime);
      end
    else
      redis.call("SET", worker_type, worker_id);
      redis.call("EXPIRE", worker_type, lifetime);
      current_worker = worker_id
    end
else
    if current_worker then
      if current_worker == worker_id then
        redis.call("EXPIRE", worker_type, lifetime);
      end
    else
      redis.call("SET", worker_type, worker_id);
      redis.call("EXPIRE", worker_type, lifetime);
      current_worker = worker_id
    end
end

return current_worker

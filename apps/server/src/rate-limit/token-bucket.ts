/**
 * Token bucket in Redis. Refills continuously at `refillPerMs` up to `capacity`; a call with
 * cost 0 only checks that at least one token is left. Uses Redis' clock so that several server
 * instances share one notion of time.
 *
 * KEYS[1] bucket key · ARGV capacity, refillPerMs, cost → { allowed (0|1), tokens left }
 */
export const TOKEN_BUCKET_SCRIPT = `
local capacity = tonumber(ARGV[1])
local refill_per_ms = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local state = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(state[1])
local ts = tonumber(state[2])
if tokens == nil or ts == nil then
  tokens = capacity
  ts = now
end
tokens = math.min(capacity, tokens + math.max(0, now - ts) * refill_per_ms)
local allowed = 0
if tokens >= math.max(cost, 1) then
  allowed = 1
  tokens = tokens - cost
end
redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(now))
redis.call('PEXPIRE', KEYS[1], math.ceil(capacity / refill_per_ms))
return { allowed, math.floor(tokens) }
`;

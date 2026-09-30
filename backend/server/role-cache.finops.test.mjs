import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture() {
  const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const start = source.indexOf('const ROLE_CACHE_TTL_MS =');
  const end = source.indexOf('async function callerCanSeeInstructor', start);
  assert.ok(start >= 0 && end > start);
  let now = 1000, queries = 0, sweep, interval, unref = false;
  const pool = { query: async () => { queries++; return { rows: [{role:'admin'}] }; } };
  const context = vm.createContext({
    Date: { now: () => now }, pool,
    setInterval: (fn, ms) => { sweep = fn; interval = ms; return { unref: () => { unref = true; } }; },
  });
  vm.runInContext(source.slice(start, end) + ';globalThis.api = { roleCache, getRoleCached, invalidateRoleCache };', context);
  return { ...context.api, sweep: () => sweep(), advance: ms => {now += ms;}, queries:()=>queries,
    timer:()=>({interval,unref}), now:()=>now };
}

test('purge removes only expired roles, including TTL boundary', async () => {
  const f=fixture();
  f.roleCache.set('expired', {role:'client',expiresAt:f.now()-1});
  f.roleCache.set('boundary', {role:'instructor',expiresAt:f.now()});
  f.roleCache.set('active', {role:'admin',expiresAt:f.now()+1});
  f.sweep();
  assert.deepEqual([...f.roleCache.keys()], ['active']);
  assert.equal(await f.getRoleCached('active'), 'admin');
  assert.equal(f.queries(), 0);
  assert.deepEqual(f.timer(), {interval:60000,unref:true});
});

test('role cache still queries after expiration and respects invalidation', async () => {
  const f=fixture();
  assert.equal(await f.getRoleCached(null), null);
  assert.equal(await f.getRoleCached('fixture-user'), 'admin');
  assert.equal(await f.getRoleCached('fixture-user'), 'admin');
  assert.equal(f.queries(), 1);
  f.advance(300000);f.sweep();
  assert.equal(f.roleCache.size, 0);
  assert.equal(await f.getRoleCached('fixture-user'), 'admin');
  assert.equal(f.queries(), 2);
  f.invalidateRoleCache('fixture-user');
  assert.equal(f.roleCache.size, 0);
});

test('expired one-time users are released without deleting active users', () => {
  const f=fixture();
  for(let i=0;i<10000;i++) f.roleCache.set('expired-'+i,{role:'client',expiresAt:f.now()-1});
  for(let i=0;i<100;i++) f.roleCache.set('active-'+i,{role:'client',expiresAt:f.now()+300000});
  f.sweep();assert.equal(f.roleCache.size,100);
  assert.ok([...f.roleCache.keys()].every(key=>key.startsWith('active-')));
});

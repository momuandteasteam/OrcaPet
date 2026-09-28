const test = require('node:test');
const assert = require('node:assert/strict');
const { detectState, parseOrcaSnapshot, parseProcessList } = require('../src/status-monitor');

test('detects an agent launched beneath Orca', () => {
  const processes = parseProcessList(`  10 1 01:00 /Applications/Orca.app/Contents/MacOS/Orca\n  11 10 00:03 /bin/zsh\n  12 11 00:02 codex --model gpt-5\n`);
  assert.deepEqual(detectState(processes), { state: 'running', detail: '1 agent active' });
});

test('reports idle when Orca has no agent child', () => {
  const processes = parseProcessList('10 1 01:00 /Applications/Orca.app/Contents/MacOS/Orca\n');
  assert.deepEqual(detectState(processes), { state: 'idle', detail: 'Orca is open' });
});

test('does not mistake a directory named orca for the Orca app', () => {
  const processes = parseProcessList('10 1 00:01 node /Users/me/orca/projects/tool.js\n');
  assert.deepEqual(detectState(processes), { state: 'idle', detail: 'Orca is not running' });
});

test('builds a privacy-safe insight from Orca worktree status', () => {
  const status = parseOrcaSnapshot(JSON.stringify({
    ok: true,
    result: {
      worktrees: [{
        repo: 'orcapet', displayName: 'main', branch: 'refs/heads/main', liveTerminalCount: 2, unread: true,
        agents: [{ state: 'working', agentType: 'codex', prompt: 'private prompt', updatedAt: 42 }]
      }]
    }
  }));
  assert.equal(status.state, 'running');
  assert.equal(status.insight.primary, 'orcapet/main · codex · working');
  assert.equal(status.insight.secondary, '稼働 1 · 完了 0 · 端末 2 · 未読 1');
  assert.equal(JSON.stringify(status).includes('private prompt'), false);
});

test('filters Orca status to one project instance', () => {
  const status = parseOrcaSnapshot(JSON.stringify({ ok: true, result: { worktrees: [
    { path: '/tmp/one', repo: 'one', displayName: 'main', agents: [{ state: 'working', agentType: 'codex' }] },
    { path: '/tmp/two', repo: 'two', displayName: 'feature', agents: [{ state: 'waiting', agentType: 'claude' }] }
  ] } }), '/tmp/two');
  assert.equal(status.state, 'waiting');
  assert.equal(status.insight.project, 'two/feature');
  assert.equal(status.insight.counts.working, 0);
});

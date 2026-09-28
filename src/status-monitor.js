const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ACTIVE_AGENT = /(?:^|\/|\s)(codex|claude|opencode|cursor-agent|gemini|aider|goose|amp)(?:\s|$)/i;
const ORCA = /(?:\/Orca\.app\/|(?:^|\s)orca(?:\s|$))/i;
const DEFAULT_ORCA_CLI = process.platform === 'darwin'
  ? '/Applications/Orca.app/Contents/Resources/bin/orca'
  : 'orca';

function normalizeAgentState(state) {
  if (['working', 'running', 'active', 'thinking', 'tool'].includes(state)) return 'running';
  if (['waiting', 'blocked', 'asking', 'input-required', 'approval-required'].includes(state)) return 'waiting';
  if (['failed', 'error', 'interrupted'].includes(state)) return 'failed';
  if (['review', 'reviewing'].includes(state)) return 'review';
  return 'idle';
}

function parseOrcaSnapshot(output, projectPath = null) {
  const payload = JSON.parse(output);
  if (!payload.ok || !Array.isArray(payload.result?.worktrees)) throw new Error('Invalid Orca response');
  const allWorktrees = payload.result.worktrees.filter((item) => !item.isArchived);
  const normalizedProjectPath = projectPath ? path.resolve(projectPath) : null;
  const worktrees = normalizedProjectPath
    ? allWorktrees.filter((item) => path.resolve(item.path) === normalizedProjectPath)
    : allWorktrees;
  const agents = worktrees.flatMap((worktree) => (worktree.agents || []).map((agent) => ({ worktree, agent })));
  const working = agents.filter(({ agent }) => normalizeAgentState(agent.state) === 'running');
  const waiting = agents.filter(({ agent }) => normalizeAgentState(agent.state) === 'waiting');
  const failed = agents.filter(({ agent }) => normalizeAgentState(agent.state) === 'failed');
  const done = agents.filter(({ agent }) => agent.state === 'done');
  const focus = waiting[0] || failed[0] || working[0] || agents
    .slice()
    .sort((a, b) => (b.agent.updatedAt || 0) - (a.agent.updatedAt || 0))[0];
  const activeWorktree = focus?.worktree || worktrees.find((item) => item.isActive) || worktrees[0];
  const agent = focus?.agent;
  const state = agent ? normalizeAgentState(agent.state) : 'idle';
  const branch = (activeWorktree?.branch || '').replace(/^refs\/heads\//, '');
  const agentName = agent?.displayName || agent?.agentType || null;
  const project = activeWorktree
    ? `${activeWorktree.repo || 'workspace'}/${activeWorktree.displayName || branch || 'main'}`
    : 'Orca';
  const primary = agent
    ? `${project} · ${agentName || 'agent'} · ${agent.state}`
    : `${project} · idle`;
  const liveTerminals = worktrees.reduce((sum, item) => sum + (item.liveTerminalCount || 0), 0);
  const unread = worktrees.filter((item) => item.unread).length;
  const secondaryParts = [
    `稼働 ${working.length}`,
    waiting.length ? `待機 ${waiting.length}` : null,
    `完了 ${done.length}`,
    `端末 ${liveTerminals}`,
    unread ? `未読 ${unread}` : null
  ].filter(Boolean);
  return {
    state,
    detail: primary,
    source: 'orca-cli',
    insight: {
      primary,
      secondary: secondaryParts.join(' · '),
      project,
      branch,
      agent: agentName,
      rawState: agent?.state || 'idle',
      projectPath: activeWorktree?.path || normalizedProjectPath,
      counts: { working: working.length, waiting: waiting.length, failed: failed.length, done: done.length, worktrees: worktrees.length, liveTerminals, unread }
    }
  };
}

function parseProcessList(output) {
  return output.split('\n').map((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    return match ? { pid: Number(match[1]), ppid: Number(match[2]), elapsed: match[3], command: match[4] } : null;
  }).filter(Boolean);
}

function descendantsOf(processes, roots) {
  const ids = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const process of processes) {
      if (ids.has(process.ppid) && !ids.has(process.pid)) {
        ids.add(process.pid);
        changed = true;
      }
    }
  }
  return ids;
}

function detectState(processes) {
  const orcaPids = processes.filter((process) => ORCA.test(process.command)).map((process) => process.pid);
  const descendants = descendantsOf(processes, orcaPids);
  const agents = processes.filter((process) => descendants.has(process.pid) && ACTIVE_AGENT.test(process.command));
  if (agents.length > 0) return { state: 'running', detail: `${agents.length} agent${agents.length === 1 ? '' : 's'} active` };
  if (orcaPids.length > 0) return { state: 'idle', detail: 'Orca is open' };
  return { state: 'idle', detail: 'Orca is not running' };
}

function readOverride(statusFile) {
  try {
    const stat = fs.statSync(statusFile);
    if (Date.now() - stat.mtimeMs > 30 * 60 * 1000) return null;
    const value = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    if (!['idle', 'running', 'waiting', 'review', 'failed'].includes(value.state)) return null;
    return { state: value.state, detail: value.detail || 'External status', source: 'override' };
  } catch {
    return null;
  }
}

class StatusMonitor {
  constructor(onStatus, options = {}) {
    this.onStatus = onStatus;
    this.intervalMs = options.intervalMs || 2500;
    this.statusFile = options.statusFile || path.join(process.env.ORCAPET_HOME || path.join(os.homedir(), '.orcapet'), 'status.json');
    this.orcaCli = options.orcaCli || process.env.ORCA_CLI || DEFAULT_ORCA_CLI;
    this.projectPath = options.projectPath || null;
    this.timer = null;
    this.last = '';
  }

  start() {
    this.poll();
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  poll() {
    const override = readOverride(this.statusFile);
    if (override) return this.emit(override);
    execFile(this.orcaCli, ['worktree', 'ps', '--json'], { timeout: 2200, maxBuffer: 4 * 1024 * 1024 }, (orcaError, orcaStdout) => {
      if (!orcaError) {
        try {
          return this.emit(parseOrcaSnapshot(orcaStdout, this.projectPath));
        } catch {
          // Fall through to the process-based compatibility detector.
        }
      }
      execFile('ps', ['-axo', 'pid=,ppid=,etime=,command='], { timeout: 1500 }, (error, stdout) => {
        if (error) return this.emit({ state: 'idle', detail: 'Status unavailable' });
        this.emit(detectState(parseProcessList(stdout)));
      });
    });
  }

  emit(status) {
    const serialized = JSON.stringify(status);
    if (serialized === this.last) return;
    this.last = serialized;
    this.onStatus(status);
  }
}

module.exports = { ACTIVE_AGENT, ORCA, StatusMonitor, descendantsOf, detectState, normalizeAgentState, parseOrcaSnapshot, parseProcessList, readOverride };

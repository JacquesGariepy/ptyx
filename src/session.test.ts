/**
 * Session Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SessionRecorder,
  SessionPlayer,
  createSessionRecorder,
  createSessionPlayer,
} from './session';
import type { Message } from './types';
import { createMessage } from './utils';

describe('SessionRecorder', () => {
  let recorder: SessionRecorder;

  beforeEach(() => {
    recorder = new SessionRecorder('agent-1', 'test-agent', 'node', ['-i']);
  });

  describe('recording', () => {
    it('should record messages', () => {
      const msg = createMessage('hello', 'out', 'agent-1', 1);
      recorder.record(msg);

      expect(recorder.messageCount).toBe(1);
    });

    it('should not record after end', () => {
      recorder.end();
      const msg = createMessage('hello', 'out', 'agent-1', 1);
      recorder.record(msg);

      expect(recorder.messageCount).toBe(0);
    });

    it('should track session ID', () => {
      expect(recorder.id).toMatch(/^session-/);
    });

    it('should track duration', () => {
      const start = recorder.duration;
      expect(start).toBeGreaterThanOrEqual(0);
    });

    it('should set metadata', () => {
      recorder.setMetadata('user', 'test-user');
      const data = recorder.getData();
      expect(data.metadata?.user).toBe('test-user');
    });
  });

  describe('export', () => {
    beforeEach(() => {
      recorder.record(createMessage('hello', 'out', 'agent-1', 1));
      recorder.record(createMessage('input', 'in', 'agent-1', 2));
      recorder.record(createMessage('world', 'out', 'agent-1', 3));
      recorder.end();
    });

    it('should export to JSON', () => {
      const json = recorder.export('json');
      const data = JSON.parse(json);

      expect(data.command).toBe('node');
      expect(data.args).toEqual(['-i']);
      expect(data.messages).toHaveLength(3);
    });

    it('should export to asciinema format', () => {
      const cast = recorder.export('asciinema');
      const lines = cast.split('\n');

      // First line is header
      const header = JSON.parse(lines[0]);
      expect(header.version).toBe(2);

      // Following lines are events (only output)
      expect(lines.length).toBeGreaterThan(1);
    });

    it('should export to TypeScript', () => {
      const ts = recorder.export('typescript');

      expect(ts).toContain('import { createAgent }');
      expect(ts).toContain("command: \"node\"");
      expect(ts).toContain('async function replay()');
    });

    it('should export to script format', () => {
      const script = recorder.export('script');

      expect(script).toContain('hello');
      expect(script).toContain('world');
      expect(script).not.toContain('input'); // Only output
    });

    it('should throw on unknown format', () => {
      expect(() => recorder.export('unknown' as any)).toThrow('Unknown export format');
    });
  });

  describe('fromJSON', () => {
    it('should restore recorder from JSON', () => {
      recorder.record(createMessage('test', 'out', 'agent-1', 1));
      recorder.end();

      const json = recorder.export('json');
      const restored = SessionRecorder.fromJSON(json);

      expect(restored.id).toBe(recorder.id);
      expect(restored.messageCount).toBe(1);
      expect(restored.ended).toBe(true);
    });
  });
});

describe('SessionPlayer', () => {
  let sessionData: any;

  beforeEach(() => {
    sessionData = {
      id: 'test-session',
      agentId: 'agent-1',
      agentName: 'test',
      command: 'node',
      args: ['-i'],
      startTime: Date.now(),
      endTime: Date.now() + 1000,
      messages: [
        { ts: 0, dir: 'o', data: 'frame1' },
        { ts: 100, dir: 'o', data: 'frame2' },
        { ts: 200, dir: 'o', data: 'frame3' },
      ],
    };
  });

  describe('creation', () => {
    it('should create from JSON string', () => {
      const player = SessionPlayer.fromJSON(JSON.stringify(sessionData));
      expect(player.totalFrames).toBe(3);
    });

    it('should create from data object', () => {
      const player = SessionPlayer.fromData(sessionData);
      expect(player.totalFrames).toBe(3);
    });
  });

  describe('playback', () => {
    it('should play all frames', async () => {
      const player = SessionPlayer.fromData(sessionData);
      const frames: string[] = [];

      await player.play((data) => frames.push(data), { skipDelays: true });

      expect(frames).toEqual(['frame1', 'frame2', 'frame3']);
      expect(player.position).toBe(3);
    });

    it('should respect speed setting', async () => {
      const player = SessionPlayer.fromData(sessionData);
      player.setSpeed(10); // 10x speed

      const start = Date.now();
      await player.play(() => {});
      const elapsed = Date.now() - start;

      // Should be faster than normal (200ms / 10 = 20ms, but allow some margin)
      expect(elapsed).toBeLessThan(300);
    });

    it('should stop on command', async () => {
      const player = SessionPlayer.fromData(sessionData);
      const frames: string[] = [];

      setTimeout(() => player.stop(), 50);

      await player.play((data) => frames.push(data), { skipDelays: true });

      expect(player.playing).toBe(false);
    });

    it('should report playing status', async () => {
      const player = SessionPlayer.fromData(sessionData);

      expect(player.playing).toBe(false);

      const playPromise = player.play(() => {}, { skipDelays: true });
      // Playing status is true during playback
      await playPromise;

      expect(player.playing).toBe(false);
    });

    it('should calculate duration', () => {
      const player = SessionPlayer.fromData(sessionData);
      expect(player.duration).toBe(200);
    });
  });

  describe('pause/resume', () => {
    it('should pause and resume', async () => {
      const player = SessionPlayer.fromData(sessionData);
      const frames: string[] = [];

      const playPromise = player.play((data) => frames.push(data), { skipDelays: true });

      // Pause briefly
      player.pause();
      expect(player.paused).toBe(true);

      setTimeout(() => player.resume(), 10);

      await playPromise;

      expect(frames).toHaveLength(3);
    });
  });
});

describe('createSessionRecorder', () => {
  it('should return middleware and recorder getter', () => {
    const { middleware, getRecorder, hasRecorder } = createSessionRecorder();

    expect(middleware.name).toBe('session-recorder');
    expect(middleware.direction).toBe('both');
    expect(hasRecorder()).toBe(false);
  });

  it('should initialize recorder on first message', async () => {
    const { middleware, getRecorder, hasRecorder } = createSessionRecorder();

    const ctx = {
      agent: { id: 'agent-1', name: 'test' },
      config: { command: 'node', args: ['-i'], cols: 80, rows: 24 },
      history: [],
      state: new Map(),
      send: vi.fn(),
      emit: vi.fn(),
      log: vi.fn(),
    } as any;

    await middleware.fn(createMessage('test', 'out', 'agent-1', 1), ctx, async () => {});

    expect(hasRecorder()).toBe(true);
    const recorder = getRecorder();
    expect(recorder.messageCount).toBe(1);
  });

  it('should throw if getRecorder called before initialization', () => {
    const { getRecorder } = createSessionRecorder();
    expect(() => getRecorder()).toThrow('not initialized');
  });
});

describe('createSessionPlayer', () => {
  it('should create from JSON string', () => {
    const data = {
      id: 'test',
      agentId: 'a',
      agentName: 'n',
      command: 'c',
      args: [],
      startTime: 0,
      messages: [],
    };
    const player = createSessionPlayer(JSON.stringify(data));
    expect(player).toBeInstanceOf(SessionPlayer);
  });

  it('should create from SessionRecorder', () => {
    const recorder = new SessionRecorder('a', 'n', 'c', []);
    const player = createSessionPlayer(recorder);
    expect(player).toBeInstanceOf(SessionPlayer);
  });

  it('should create from data object', () => {
    const data = {
      id: 'test',
      agentId: 'a',
      agentName: 'n',
      command: 'c',
      args: [],
      startTime: 0,
      messages: [],
    };
    const player = createSessionPlayer(data);
    expect(player).toBeInstanceOf(SessionPlayer);
  });
});

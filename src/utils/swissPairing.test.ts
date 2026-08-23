import { describe, it, expect } from 'vitest';
import {
  generatePairings,
  generateSwissPairings,
  getRankedPlayers,
  getSingleEliminationRounds,
  calculateAllWinRates,
  createPlayersFromNames,
  getRoundGameType,
} from './swissPairing';
import type { Player, Match, TournamentGroup } from '../types';

function makePlayer(id: string, name: string, over: Partial<Player> = {}): Player {
  return {
    id,
    name,
    points: 0,
    wins: 0,
    losses: 0,
    totalGames: 0,
    wonGames: 0,
    winRate: 0,
    opponentWinRate: 0,
    opponentOpponentWinRate: 0,
    gameWinRate: 0,
    opponentGameWinRate: 0,
    playedAgainst: [],
    previousRank: 1,
    dropped: false,
    eliminated: false,
    downMatchCount: 0,
    upMatchCount: 0,
    hasDownPriority: false,
    hasUpPriority: false,
    ...over,
  };
}

function makeMatch(id: string, round: number, p1Id: string, p2Id: string, result: Match['result'] = 'pending', isBye = false): Match {
  return { id, round, player1Id: p1Id, player2Id: p2Id, result, isBye };
}

describe('getSingleEliminationRounds', () => {
  it('2 人需 1 轮', () => {
    expect(getSingleEliminationRounds(2)).toBe(1);
  });
  it('4 人需 2 轮', () => {
    expect(getSingleEliminationRounds(4)).toBe(2);
  });
  it('8 人需 3 轮', () => {
    expect(getSingleEliminationRounds(8)).toBe(3);
  });
  it('32 人需 5 轮', () => {
    expect(getSingleEliminationRounds(32)).toBe(5);
  });
  // 6 人需向上取整到 2^3=8 的对数 → 3 轮
  it('6 人需 3 轮（向上取整到 2 的幂）', () => {
    expect(getSingleEliminationRounds(6)).toBe(3);
  });
  it('1 人需 0 轮', () => {
    expect(getSingleEliminationRounds(1)).toBe(0);
  });
});

describe('getRoundGameType', () => {
  it('优先使用 roundGameTypes 数组', () => {
    const group: TournamentGroup = {
      id: 'g1', name: 'g1', currentRound: 1, totalRounds: 3, status: 'in_progress',
      players: [], matches: [], createdAt: '', pairingType: 'swiss', gameType: 'bo1',
      roundGameTypes: ['bo1', 'bo3', 'bo5'],
    };
    expect(getRoundGameType(group, 1)).toBe('bo1');
    expect(getRoundGameType(group, 2)).toBe('bo3');
    expect(getRoundGameType(group, 3)).toBe('bo5');
  });
  it('未设置 roundGameTypes 时回退到 gameType', () => {
    const group: TournamentGroup = {
      id: 'g1', name: 'g1', currentRound: 1, totalRounds: 3, status: 'in_progress',
      players: [], matches: [], createdAt: '', pairingType: 'swiss', gameType: 'bo7',
    };
    expect(getRoundGameType(group, 1)).toBe('bo7');
    expect(getRoundGameType(group, 5)).toBe('bo7');
  });
  it('roundGameTypes 长度不足时回退到 gameType', () => {
    const group: TournamentGroup = {
      id: 'g1', name: 'g1', currentRound: 1, totalRounds: 3, status: 'in_progress',
      players: [], matches: [], createdAt: '', pairingType: 'swiss', gameType: 'bo1',
      roundGameTypes: ['bo3'],
    };
    expect(getRoundGameType(group, 1)).toBe('bo3');
    expect(getRoundGameType(group, 2)).toBe('bo1');
  });
});

describe('createPlayersFromNames', () => {
  it('为每个名字生成独立选手', () => {
    const players = createPlayersFromNames(['张三', '李四', '王五']);
    expect(players).toHaveLength(3);
    expect(players.map(p => p.name)).toEqual(['张三', '李四', '王五']);
    players.forEach(p => {
      expect(p.id).toBeTruthy();
      expect(p.points).toBe(0);
      expect(p.wins).toBe(0);
      expect(p.playedAgainst).toEqual([]);
    });
  });
  it('按顺序分配 previousRank', () => {
    const players = createPlayersFromNames(['a', 'b', 'c']);
    expect(players[0].previousRank).toBe(1);
    expect(players[1].previousRank).toBe(2);
    expect(players[2].previousRank).toBe(3);
  });
  it('过滤首尾空白', () => {
    const players = createPlayersFromNames(['  张三  ']);
    expect(players[0].name).toBe('张三');
  });
});

describe('generateSwissPairings', () => {
  it('偶数选手：不产生轮空', () => {
    const players = createPlayersFromNames(['p1', 'p2', 'p3', 'p4']);
    const { matches } = generateSwissPairings(players, 1, 'bo1');
    const byes = matches.filter(m => m.isBye);
    expect(byes).toHaveLength(0);
    expect(matches).toHaveLength(2);
  });

  it('奇数选手：恰好产生一个轮空', () => {
    const players = createPlayersFromNames(['p1', 'p2', 'p3', 'p4', 'p5']);
    const { matches } = generateSwissPairings(players, 1, 'bo1');
    const byes = matches.filter(m => m.isBye);
    expect(byes).toHaveLength(1);
    // 普通对阵 + 1 轮空 = (5-1)/2 + 1 = 3
    expect(matches).toHaveLength(3);
  });

  it('轮空场次自动判定为 player1 胜', () => {
    const players = createPlayersFromNames(['p1', 'p2', 'p3']);
    const { matches } = generateSwissPairings(players, 1, 'bo1');
    const byeMatch = matches.find(m => m.isBye);
    expect(byeMatch).toBeDefined();
    expect(byeMatch!.result).toBe('player1');
    expect(byeMatch!.player2Id).toBe('bye');
  });

  it('每场比赛两位选手不同', () => {
    const players = createPlayersFromNames(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    const { matches } = generateSwissPairings(players, 1, 'bo1');
    for (const m of matches) {
      if (m.isBye) continue;
      expect(m.player1Id).not.toBe(m.player2Id);
    }
  });

  it('所有选手在单轮中只出现一次', () => {
    const players = createPlayersFromNames(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
    const { matches } = generateSwissPairings(players, 1, 'bo1');
    const idCount = new Map<string, number>();
    for (const m of matches) {
      idCount.set(m.player1Id, (idCount.get(m.player1Id) || 0) + 1);
      if (!m.isBye) {
        idCount.set(m.player2Id, (idCount.get(m.player2Id) || 0) + 1);
      }
    }
    // 每个选手应恰好出现 1 次
    for (const p of players) {
      expect(idCount.get(p.id)).toBe(1);
    }
  });

  it('多轮配对：已交手过的选手不重复相遇（4 人 3 轮）', () => {
    const players = createPlayersFromNames(['p1', 'p2', 'p3', 'p4']);
    let currentPlayers = players;
    const allMatches: Match[] = [];
    const playedPairs = new Set<string>();

    const pairKey = (a: string, b: string) => [a, b].sort().join('--');

    for (let round = 1; round <= 3; round++) {
      const { matches, updatedPlayers } = generateSwissPairings(currentPlayers, round, 'bo1');
      // 验证：本轮中每对选手此前未交手过
      for (const m of matches) {
        if (m.isBye) continue;
        const key = pairKey(m.player1Id, m.player2Id);
        expect(playedPairs.has(key)).toBe(false);
        playedPairs.add(key);
      }
      // 应用随机结果
      const applied: Match[] = matches.map(m => {
        if (m.isBye) return m;
        const p1Wins = Math.random() < 0.5;
        return { ...m, result: p1Wins ? 'player1' : 'player2', player1Games: p1Wins ? 1 : 0, player2Games: p1Wins ? 0 : 1 };
      });
      allMatches.push(...applied);
      // 更新选手战绩
      currentPlayers = updatedPlayers.map(p => {
        let wins = p.wins, losses = p.losses, points = p.points;
        const playedAgainst = [...p.playedAgainst];
        for (const m of applied) {
          if (m.isBye && m.player1Id === p.id) {
            wins += 1; points += 1;
            if (!playedAgainst.includes('bye')) playedAgainst.push('bye');
          } else if (!m.isBye && m.player1Id === p.id) {
            if (m.result === 'player1') { wins += 1; points += 1; }
            else { losses += 1; }
            playedAgainst.push(m.player2Id);
          } else if (!m.isBye && m.player2Id === p.id) {
            if (m.result === 'player2') { wins += 1; points += 1; }
            else { losses += 1; }
            playedAgainst.push(m.player1Id);
          }
        }
        return { ...p, wins, losses, points, playedAgainst };
      });
      currentPlayers = calculateAllWinRates(currentPlayers, allMatches, 'bo1');
    }

    // 3 轮后共应记录 6 个不同对（每轮 2 对）
    expect(playedPairs.size).toBeGreaterThanOrEqual(5);
  });

  it('同分选手不重复配对（已交手过的不应再相遇）', () => {
    const players = createPlayersFromNames(['p1', 'p2', 'p3', 'p4']);
    // 第 1 轮
    const r1 = generateSwissPairings(players, 1, 'bo1');
    // 模拟 p1 vs p2, p3 vs p4，结果为 p1 胜、p3 胜
    const r1Applied: Match[] = r1.matches.map((m, i) => ({
      ...m,
      result: i === 0 ? 'player1' : 'player1',
      player1Games: 1, player2Games: 0,
    }));
    const playerMap = new Map(players.map(p => [p.id, { ...p }]));
    for (const m of r1Applied) {
      const p1 = playerMap.get(m.player1Id);
      const p2 = playerMap.get(m.player2Id);
      if (!p1 || !p2 || m.isBye) continue;
      if (m.result === 'player1') { p1.wins += 1; p1.points += 1; p2.losses += 1; }
      p1.playedAgainst.push(p2.id);
      p2.playedAgainst.push(p1.id);
    }
    const updatedPlayers = Array.from(playerMap.values());
    // 第 2 轮：p1 与 p3 同为 1 胜，p2 与 p4 同为 1 负
    const r2 = generateSwissPairings(updatedPlayers, 2, 'bo1');
    // p1 不应再次遇到 p2，p3 不应再次遇到 p4
    for (const m of r2.matches) {
      if (m.isBye) continue;
      const a = m.player1Id;
      const b = m.player2Id;
      const r1Match = r1Applied.find(rm => !rm.isBye && ((rm.player1Id === a && rm.player2Id === b) || (rm.player1Id === b && rm.player2Id === a)));
      expect(r1Match).toBeUndefined();
    }
  });
});

describe('sortPlayers / getRankedPlayers', () => {
  it('高胜率排在低胜率之前', () => {
    const players = [
      makePlayer('a', 'A', { wins: 3, losses: 0, winRate: 1.0 }),
      makePlayer('b', 'B', { wins: 0, losses: 3, winRate: 0.0 }),
      makePlayer('c', 'C', { wins: 1, losses: 1, winRate: 0.5 }),
    ];
    const ranked = getRankedPlayers(players, 'bo1', 'swiss');
    expect(ranked[0].id).toBe('a');
    expect(ranked[1].id).toBe('c');
    expect(ranked[2].id).toBe('b');
  });

  it('弃赛选手排在所有未弃赛之后', () => {
    const players = [
      makePlayer('a', 'A', { wins: 0, losses: 3, winRate: 0.0, dropped: true }),
      makePlayer('b', 'B', { wins: 0, losses: 3, winRate: 0.0 }),
    ];
    const ranked = getRankedPlayers(players, 'bo1', 'swiss');
    expect(ranked[0].id).toBe('b');
    expect(ranked[1].id).toBe('a');
  });

  it('胜率相同时按对手胜率排序', () => {
    const players = [
      makePlayer('a', 'A', { wins: 1, losses: 1, winRate: 0.5, opponentWinRate: 0.6 }),
      makePlayer('b', 'B', { wins: 1, losses: 1, winRate: 0.5, opponentWinRate: 0.4 }),
    ];
    const ranked = getRankedPlayers(players, 'bo1', 'swiss');
    expect(ranked[0].id).toBe('a');
    expect(ranked[1].id).toBe('b');
  });
});

describe('calculateAllWinRates', () => {
  it('未参与任何比赛的选手胜率为 0', () => {
    const players = [makePlayer('a', 'A')];
    const result = calculateAllWinRates(players, [], 'bo1');
    expect(result[0].winRate).toBe(0);
    expect(result[0].opponentWinRate).toBe(0);
    expect(result[0].gameWinRate).toBe(0);
  });

  it('根据比赛结果正确计算胜率', () => {
    const players = [
      makePlayer('a', 'A', { wins: 1, losses: 1 }),
      makePlayer('b', 'B', { wins: 1, losses: 1 }),
    ];
    const matches: Match[] = [
      makeMatch('m1', 1, 'a', 'b', 'player1'),
      makeMatch('m2', 2, 'a', 'b', 'player2'),
    ];
    const result = calculateAllWinRates(players, matches, 'bo1');
    // a 与 b 各 1 胜 1 负 → 胜率均 0.5
    expect(result[0].winRate).toBeCloseTo(0.5);
    expect(result[1].winRate).toBeCloseTo(0.5);
    // 聚合公式 SOS：只遇到同一个对手 b(1-1) → 胜场和 1 / 总场次和 2 = 0.5
    expect(result[0].opponentWinRate).toBeCloseTo(0.5);
    expect(result[1].opponentWinRate).toBeCloseTo(0.5);
  });

  it('跳过 pending 和 bye 比赛不计入胜率', () => {
    const players = [
      makePlayer('a', 'A', { wins: 1, losses: 0 }),
      makePlayer('b', 'B', { wins: 0, losses: 1 }),
      makePlayer('c', 'C'),
    ];
    const matches: Match[] = [
      makeMatch('m1', 1, 'a', 'b', 'player1'),
      makeMatch('m2', 2, 'a', 'c', 'pending'),
      makeMatch('m3', 2, 'a', 'bye', 'player1', true),
    ];
    const result = calculateAllWinRates(players, matches, 'bo1');
    // a: 1 胜 0 负 → 1.0
    expect(result[0].winRate).toBeCloseTo(1.0);
  });

  it('弃赛对手 SOS 使用聚合公式：对手胜场和 / 对手总场次和（弃赛场次少自动降权）', () => {
    // 用户原始需求场景：
    // 我(Me)的两个对手：X=5-0 全胜，Y=0-1 弃赛只打了 1 场
    // 期望 SOS = (5 + 0) / (5+0 + 0+1) = 5/6 ≈ 0.8333
    //   （对比旧的人均公式：(5/5 + 0/1)/2 = 0.5，会被弃赛选手过度拉低）
    const me = makePlayer('me', '我', { wins: 1, losses: 1 });          // 1-1
    const x = makePlayer('x', 'X', { wins: 5, losses: 0 });              // 5-0
    const y = makePlayer('y', 'Y弃赛', { wins: 0, losses: 1, dropped: true }); // 0-1 弃赛
    const other1 = makePlayer('o1', '其他1', { wins: 0, losses: 2 });
    const other2 = makePlayer('o2', '其他2', { wins: 0, losses: 2 });
    const other3 = makePlayer('o3', '其他3', { wins: 0, losses: 1 });
    const other4 = makePlayer('o4', '其他4', { wins: 0, losses: 1 });
    const other5 = makePlayer('o5', '其他5', { wins: 2, losses: 0 });    // 2-0
    const players = [me, x, y, other1, other2, other3, other4, other5];

    const matches: Match[] = [
      // Me vs X → X 胜；Me vs Y → Me 胜 (Y 弃赛，0-1)
      makeMatch('m-me-x', 1, 'me', 'x', 'player2'),
      makeMatch('m-me-y', 2, 'me', 'y', 'player1'),
      // X 另外 4 场胜利 (凑 5-0)
      makeMatch('m-x-o1', 1, 'x', 'o1', 'player1'),
      makeMatch('m-x-o2', 2, 'x', 'o2', 'player1'),
      makeMatch('m-x-o3', 3, 'x', 'o3', 'player1'),
      makeMatch('m-x-o4', 4, 'x', 'o4', 'player1'),
      // o5 胜 o1、胜 o2 (o5=2-0, o1/o2 各再添 1 负)
      makeMatch('o1-o5', 3, 'o1', 'o5', 'player2'),
      makeMatch('o2-o5', 4, 'o2', 'o5', 'player2'),
    ];

    const result = calculateAllWinRates(players, matches, 'bo1');
    const meResult = result.find(p => p.id === 'me')!;
    // Me 的对手：X(5-0) 和 Y(0-1 弃赛)
    // 聚合 SOS = Σ对手胜场 / Σ对手总场次 = (5 + 0) / (5 + 1) = 5/6
    expect(meResult.opponentWinRate).toBeCloseTo(5 / 6);
    // 再确认：不是旧人均公式的 0.5
    expect(meResult.opponentWinRate).not.toBeCloseTo(0.5);
  });

  it('SOSOS 对手对手胜率同样使用聚合公式（对手的对手胜场和/总场次和）', () => {
    // 三人 A-B-C 三角：A 胜 B，B 胜 C，C 胜 A → 每人 1-1
    // A 的对手是 B(1-1)；B 的对手是 A(1-1) 和 C(1-1)
    // A 的 SOSOS = 摊平 B 的对手们的胜场/场次：A(1-1) + C(1-1) → (1+1)/(2+2)=2/4=0.5
    const a = makePlayer('a', 'A', { wins: 1, losses: 1 });
    const b = makePlayer('b', 'B', { wins: 1, losses: 1 });
    const c = makePlayer('c', 'C', { wins: 1, losses: 1 });
    const players = [a, b, c];
    const matches: Match[] = [
      makeMatch('m1', 1, 'a', 'b', 'player1'), // A 胜 B
      makeMatch('m2', 2, 'b', 'c', 'player1'), // B 胜 C
      makeMatch('m3', 3, 'c', 'a', 'player1'), // C 胜 A
    ];
    const [aR] = calculateAllWinRates(players, matches, 'bo1');
    // A 的 SOS：对手 B(1-1) → 1/2 = 0.5
    expect(aR.opponentWinRate).toBeCloseTo(0.5);
    // A 的 SOSOS：B 的对手 = {A, C}；A(1-1) C(1-1) → (1+1)/(2+2)=2/4=0.5
    expect(aR.opponentOpponentWinRate).toBeCloseTo(0.5);
  });

  it('BO3 对手局胜率 聚合公式：对手胜局和 / 对手总局和', () => {
    // A 对 B，BO3，A 2-1 胜：A.wonGames=2, totalGames=3；B.wonGames=1, totalGames=3
    const a = makePlayer('a', 'A', { wins: 1, losses: 0, wonGames: 2, totalGames: 3 });
    const b = makePlayer('b', 'B', { wins: 0, losses: 1, wonGames: 1, totalGames: 3 });
    const matches: Match[] = [
      {
        id: 'm1', round: 1, player1Id: 'a', player2Id: 'b',
        result: 'player1', isBye: false, player1Games: 2, player2Games: 1,
      },
    ];
    const [aR, bR] = calculateAllWinRates([a, b], matches, 'bo3');
    // A 的对手局胜率：对手 B 的胜局 1 / 总局 3 = 1/3
    expect(aR.opponentGameWinRate).toBeCloseTo(1 / 3);
    // B 的对手局胜率：对手 A 的胜局 2 / 总局 3 = 2/3
    expect(bR.opponentGameWinRate).toBeCloseTo(2 / 3);
  });

  it('赛前弃赛：胜场计入个人胜率但不计入对手SOS，用户例(4-1含1场赛前弃赛胜)→个人80%，对手SOS=3/4', () => {
    // 用户原例：选手 A 总战绩 4-1，其中 1 场胜是对手赛前弃赛。
    // 期望：个人胜率 = 4/5 = 80%；但对手 B 计算对手胜率时，A 的有效战绩视为 3 胜 / 4 场。
    const me = makePlayer('me', 'B观察', { wins: 0, losses: 1 }); // B 输了 1 场给 A
    const a = makePlayer('a', 'A', { wins: 4, losses: 1 });
    const c = makePlayer('c', 'C', { wins: 1, losses: 0 }); // C 曾输给 A
    const other1 = makePlayer('o1', 'O1', { wins: 1, losses: 0 });
    const other2 = makePlayer('o2', 'O2', { wins: 1, losses: 0 });
    const other3 = makePlayer('o3', 'O3', { wins: 1, losses: 0 });
    const loser1 = makePlayer('l1', 'L1', { wins: 0, losses: 1 });
    const loser2 = makePlayer('l2', 'L2', { wins: 0, losses: 1 });
    const loser3 = makePlayer('l3', 'L3', { wins: 0, losses: 1 });
    const players = [me, a, c, other1, other2, other3, loser1, loser2, loser3];

    // A 的 5 场：3场真实胜 (对 other1, other2, other3) + 1场赛前弃赛胜 (对 C，C赛前弃赛) + 1场真实负 (对 me 或者 someone)
    // 调整：让 me 的对手是 A，me 输给 A → A 胜 me (真实战)，再胜 other1/other2/other3真实战，再胜C赛前弃赛 → 负1场安排输给某个 loser1。
    // 这样 me 个人：0-1(负 A 真实战)。me 的对手集合中包含 A（真实交手）。A 对 me 是真实胜。
    me.wins = 0; me.losses = 1;
    a.wins = 4; a.losses = 1;
    c.wins = 0; c.losses = 1;   // C 赛前弃赛输给 A
    other1.wins = 0; other1.losses = 1; // O1 真实负 A
    other2.wins = 0; other2.losses = 1;
    other3.wins = 0; other3.losses = 1;
    loser1.wins = 1; loser1.losses = 0; // loser1 真实胜 A（也就是 A 真实负 loser1）
    loser2.wins = 0; loser2.losses = 0;
    loser3.wins = 0; loser3.losses = 0;

    const matches: Match[] = [
      // A vs me：真实，A胜
      { id: 'mA-me', round: 1, player1Id: 'a', player2Id: 'me', result: 'player1' },
      // A vs other1：真实，A胜
      { id: 'mA-o1', round: 2, player1Id: 'a', player2Id: 'o1', result: 'player1' },
      // A vs other2：真实，A胜
      { id: 'mA-o2', round: 3, player1Id: 'a', player2Id: 'o2', result: 'player1' },
      // A vs other3：真实，A胜
      { id: 'mA-o3', round: 4, player1Id: 'a', player2Id: 'o3', result: 'player1' },
      // A vs C：C赛前弃赛，A胜 → 标记 preDrop
      { id: 'mA-C', round: 5, player1Id: 'a', player2Id: 'c', result: 'player1', preDrop: true },
      // 等等：A 有 5 场(4胜1负)，上面已经给了 A 5 场胜(me,o1,o2,o3,C) —— 不对，A 需要 1 负。
      // 修正：把 A vs me 改为 me 胜 A，A 对 loser1 负，A 对 C 赛前弃赛胜。这样 A 胜的 4 场 = o1,o2,o3,C赛前弃赛，共 4 胜，再加负 loser1 = 1 负。
      // 同时让 me 的对手是 A，me 胜 A（真实交手）。这样 me 个人是 1-0。
      // 不 —— 我们希望 me 是观察对象，me 的对手是 A（真实交手过），这样 me 的 SOS 计算里有 A 的有效战绩。
    ];
    // 重写：用更一致的 setup
    const setupMatches: Match[] = [
      // me vs A：真实交手，me 胜 A → me=1-0, A 获 1 负
      { id: 'm-me-A', round: 1, player1Id: 'me', player2Id: 'a', result: 'player1' },
      // A vs other1：真实，A 胜
      { id: 'mA-o1', round: 2, player1Id: 'a', player2Id: 'o1', result: 'player1' },
      // A vs other2：真实，A 胜
      { id: 'mA-o2', round: 3, player1Id: 'a', player2Id: 'o2', result: 'player1' },
      // A vs other3：真实，A 胜
      { id: 'mA-o3', round: 4, player1Id: 'a', player2Id: 'o3', result: 'player1' },
      // A vs C：C 赛前弃赛 → A 胜（赛前弃赛）→ 记 A 1 胜（这是第 4 胜），C 1 负
      { id: 'mA-C', round: 5, player1Id: 'a', player2Id: 'c', result: 'player1', preDrop: true },
    ];
    // 调整玩家个人战绩：与 matches 一致
    me.wins = 1; me.losses = 0;    // me 真实胜 A → 1-0
    a.wins = 4; a.losses = 1;      // A: 胜 o1,o2,o3 真实 + 胜 C 赛前弃赛 = 4 胜；负 me 真实 = 1 负 → 4-1 ✓
    c.wins = 0; c.losses = 1;      // C: 赛前弃赛负 A → 1 负
    other1.wins = 0; other1.losses = 1;
    other2.wins = 0; other2.losses = 1;
    other3.wins = 0; other3.losses = 1;
    loser1.wins = 0; loser1.losses = 0;
    loser2.wins = 0; loser2.losses = 0;
    loser3.wins = 0; loser3.losses = 0;

    const result = calculateAllWinRates(players, setupMatches, 'bo1');
    const aR = result.find(p => p.id === 'a')!;
    const meR = result.find(p => p.id === 'me')!;

    // A 个人胜率：4 胜 / (4+1) = 0.8 = 80%
    expect(aR.winRate).toBeCloseTo(0.8);

    // me 的对手只有 A（真实交手 1 场）。A 的有效战绩：真实胜 o1+o2+o3 = 3胜，真实负 me = 1负，赛前弃赛胜 C = 扣掉。
    // 所以 A 的有效战绩 = 3 胜 / (3+1) 场 = 3/4
    // me 的 SOS = A 有效胜场和 / A 有效总场次和 = 3/4
    expect(meR.opponentWinRate).toBeCloseTo(3 / 4);
    // 再确认：赛前弃赛不入对手索引，A 和 C 互相不在对手集合中（所以 C 对 A 的有效战绩无影响）
    const cR = result.find(p => p.id === 'c')!;
    expect(cR.opponentWinRate).toBe(0);
  });

  it('赛前弃赛 vs 轮空的对比：赛前弃赛不入对手SOS，轮空 BYE 仍按 0胜1场 计入', () => {
    // W：真实胜 X；X：赛前弃赛 1 场负 W，真实胜 Y(轮空对手Y=BYE)
    // W 的对手集合：X(真实交手) → W 的 SOS 取 X 有效战绩
    // X 的对手集合：W(真实交手) + BYE(轮空) → X 的 SOS = W有效战绩 + BYE(0/1)
    const w = makePlayer('w', 'W', { wins: 1, losses: 0 });
    const x = makePlayer('x', 'X', { wins: 1, losses: 1 }); // 真实胜轮空BYE + 赛前弃赛负W? 不对：X 只有赛前弃赛负 W 1场+胜BYE 1场
    const y = makePlayer('y', 'Y', { wins: 1, losses: 0 });
    const players = [w, x, y];
    const matches: Match[] = [
      { id: 'm1', round: 1, player1Id: 'w', player2Id: 'x', result: 'player1', preDrop: true }, // X 赛前弃赛，W 胜（W的对手X从对手网络剔除，因 preDrop=true）
      { id: 'm2', round: 2, player1Id: 'y', player2Id: 'bye', result: 'player1', isBye: true, player1Games: 1, player2Games: 0 }, // Y 轮空 → Y 的对手是 BYE(0胜1场)
    ];
    // 更新个人战绩与 matches 对应：
    w.wins = 1; w.losses = 0;
    x.wins = 0; x.losses = 1; // X 赛前弃赛输 W
    y.wins = 1; y.losses = 0; // Y 轮空胜

    const result = calculateAllWinRates(players, matches, 'bo1');
    const [wR, xR, yR] = result;

    // 个人胜率
    expect(wR.winRate).toBeCloseTo(1.0);
    expect(xR.winRate).toBeCloseTo(0.0);
    expect(yR.winRate).toBeCloseTo(1.0);

    // W vs X 是赛前弃赛 → 互相不入对手索引。W 和 X 各自对手集合为空。SOS = 0
    expect(wR.opponentWinRate).toBe(0);
    expect(xR.opponentWinRate).toBe(0);

    // Y 轮空 → 对手是 BYE(0胜/1场)。SOS = Σ对手胜场/总场次 = 0/1 = 0
    expect(yR.opponentWinRate).toBe(0);

    // 现在给 Y 再加一个真实对手 Z，Y vs Z 真实胜 Y，验证轮空仍计入（BYE 贡献 0/1）
    const z = makePlayer('z', 'Z', { wins: 0, losses: 1 });
    const players2 = [makePlayer('w2', 'W2'), makePlayer('y2', 'Y2', { wins: 2, losses: 0 }), makePlayer('z2', 'Z2', { wins: 0, losses: 1 })];
    const matches2: Match[] = [
      { id: 'mA2', round: 1, player1Id: 'y2', player2Id: 'bye', result: 'player1', isBye: true, player1Games: 1, player2Games: 0 },
      { id: 'mB2', round: 2, player1Id: 'y2', player2Id: 'z2', result: 'player1' }, // Y2 真实胜 Z2 → 真实交手
    ];
    players2[1].wins = 2; players2[1].losses = 0; // Y2：轮空胜1 + 真实胜Z2=1
    players2[2].wins = 0; players2[2].losses = 1; // Z2：真实负 Y2
    players2[0].wins = 0; players2[0].losses = 0;
    const res2 = calculateAllWinRates(players2, matches2, 'bo1');
    const y2R = res2.find(p => p.id === 'y2')!;
    const z2R = res2.find(p => p.id === 'z2')!;
    // Y2 的对手：BYE(0胜/1场) + Z2(有效战绩 0胜/1场) → 胜场和=0+0，总场次和=1+1=2 → SOS=0
    expect(y2R.opponentWinRate).toBe(0);
    // Z2 的对手：Y2(有效战绩 轮空不算？不对 Y2 vs BYE match 中 BYE 不是赛前弃赛，是规则8轮空。Y2 的有效战绩计算：胜BYE计入 → 1胜0负（因为BYE match 不是 preDrop）；胜 Z2 真实计入 → 1胜0负；合计 2胜 0负。
    // Z2 的 SOS = 2胜 / 2场 = 1.0
    expect(z2R.opponentWinRate).toBeCloseTo(1.0);
  });

  it('赛前弃赛败方保持原战绩：1-1选手第3轮赛前弃赛 → 个人胜率仍0.5，对手SOS按1-1(1胜/2场)计入', () => {
    // 用户确认：赛前弃赛者本人不记 losses。已1-1后第3轮赛前弃赛 → 胜率0.5，计入对手胜率时仍按1-1。
    const me = makePlayer('me', '我', { wins: 1, losses: 0 });   // 我 真实胜 弃赛者X
    const x = makePlayer('x', '弃赛者X', { wins: 1, losses: 1 }); // X 前2轮1-1，第3轮赛前弃赛负我
    const a = makePlayer('a', '对手A', { wins: 1, losses: 0 }); // A 曾真实胜X
    const b = makePlayer('b', '对手B', { wins: 0, losses: 1 }); // B 曾真实负X
    const players = [me, x, a, b];
    // 匹配：
    // R1: X胜B(真实战) → X=1-0, B=0-1
    // R2: A胜X(真实战) → A=1-0, X=1-1
    // R3: 我 vs X，X赛前弃赛负我 → 我: 1-0 (个人胜), X: 个人仍是1-1 (losses不加)
    // X 的对手集合：B(真实) + A(真实)。第3轮赛前弃赛不入对手集合。
    // 所以：
    //  - 我的对手集合：X（真实战：胜X是我个人1胜。但对手集合是X→X有效战绩: effWins=1, effLosses=1 → 1/(1+1)=0.5）
    //    但等等：我胜X的那场是X的赛前弃赛 → 该 match 标记 preDrop=true → 从对手索引中剔除！所以我的对手集合为空？这不对...
    //    再仔细想：X赛前弃赛，我是胜者。对手SOS计算时"我与X的对手关系"是否存在？
    //    规则：赛前弃赛整体不入对手网络（既不把X加入我的对手集合，也不把我加入X的）。
    //    所以我此时还没有对手（只赛前弃赛赢了X）。我的 SOS=0。
    //  - X 的对手集合：B + A。
    //    B 有效战绩：0胜/1场，A 有效战绩：1胜/0场？不对，A 胜了 X 1场真实战 → A 个人战绩从 1-0。 effWins=1, effLosses=0 → 1/(1+0)=1.0
    //    X 的 SOS = (0+1) / (1+1) = 1/2
    const matches: Match[] = [
      { id: 'r1', round: 1, player1Id: 'x', player2Id: 'b', result: 'player1' },
      { id: 'r2', round: 2, player1Id: 'a', player2Id: 'x', result: 'player1' },
      { id: 'r3', round: 3, player1Id: 'me', player2Id: 'x', result: 'player1', preDrop: true }, // X 赛前弃赛，我胜
    ];
    // 注意：个人战绩是赛前弃赛下的"正确"个人战绩（非 store 处理的实时，这里手动设置）：
    // 我：胜 X 赛前弃赛胜 → 个人 wins=1, losses=0
    me.wins = 1; me.losses = 0;
    // X：前2轮1胜1负（真实），第3轮赛前弃赛负 → 不新增 loss → 1胜1负
    x.wins = 1; x.losses = 1;
    // A：真实胜 X → 1胜0负
    a.wins = 1; a.losses = 0;
    // B：真实负 X → 0胜1负
    b.wins = 0; b.losses = 1;

    const result = calculateAllWinRates(players, matches, 'bo1');
    const [meR, xR, aR, bR] = result;

    // X 个人胜率：1/(1+1) = 0.5 ✅（按1-1计）
    expect(xR.winRate).toBeCloseTo(0.5);

    // X 的对手集合：B + A（都是真实战）
    //   B 有效：0胜 1负 → 0胜 / 1场
    //   A 有效：1胜 0负 → 1胜 / 1场
    // X SOS = (0+1) / (1+1) = 1/2 = 0.5
    expect(xR.opponentWinRate).toBeCloseTo(0.5);

    // 我 vs X 赛前弃赛 → 互相不入对手集合。我暂无对手。
    expect(meR.opponentWinRate).toBe(0);

    // 补充：再构造一个"有真实对手是X(1-1)"的观察者C，验证对手SOS中X按1-1计入
    const c = makePlayer('c', '观察者C', { wins: 0, losses: 1 }); // C 真实负 X
    c.wins = 0; c.losses = 1;
    const players2 = [c, x, a, b];
    const matches2: Match[] = [
      { id: 'x-b', round: 1, player1Id: 'x', player2Id: 'b', result: 'player1' },
      { id: 'a-x', round: 2, player1Id: 'a', player2Id: 'x', result: 'player1' },
      { id: 'c-x', round: 3, player1Id: 'c', player2Id: 'x', result: 'player2' }, // C 真实负 X
    ];
    x.wins = 1; x.losses = 1;
    const res2 = calculateAllWinRates(players2, matches2, 'bo1');
    const cR2 = res2.find(p => p.id === 'c')!;
    const xR2 = res2.find(p => p.id === 'x')!;
    // X 个人仍 0.5
    expect(xR2.winRate).toBeCloseTo(0.5);
    // C 的对手只有 X（真实战）。X 的有效战绩：effWins = 胜B(真实) = 1；effLosses = 负A(真实) + 负C(真实) = 2 → 1/(1+2) = 1/3
    // 等等，上面 setup 中 match2 中 C vs X 是 player2 胜 → X胜。X 对 C 真实胜。
    //   X 胜: 胜B + 胜C = 2；X 负: 负A = 1 → 2胜1负 → 2/3
    //   C 的 SOS = 2胜 / (2+1)场 = 2/3
    expect(cR2.opponentWinRate).toBeCloseTo(2 / 3);
  });
});

describe('generatePairings（路由层）', () => {
  it('single_elimination 走单败淘汰逻辑', () => {
    const players = createPlayersFromNames(['p1', 'p2', 'p3', 'p4']);
    const { matches } = generatePairings(players, 1, 'bo1', 'single_elimination', []);
    // 4 人 → 2 场半决赛
    expect(matches).toHaveLength(2);
    expect(matches.every(m => !m.isBye || m.player2Id === 'bye')).toBe(true);
  });

  it('swiss 走瑞士轮逻辑', () => {
    const players = createPlayersFromNames(['p1', 'p2', 'p3', 'p4']);
    const { matches } = generatePairings(players, 1, 'bo1', 'swiss', []);
    expect(matches).toHaveLength(2);
    expect(matches.every(m => !m.isBye)).toBe(true);
  });
});

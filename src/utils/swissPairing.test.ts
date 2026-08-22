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

/** Edmonds blossom：无向图最大基数匹配，允许留下无法配对的人，O(n³)。
 * 顶点顺序保持传入的排名顺序。-1 表示未匹配；不修改输入。
 */
export function maximumMatching(edges: boolean[][]): number[] {
  const n = edges.length;
  const match = Array<number>(n).fill(-1);
  const parent = Array<number>(n).fill(-1);
  const base = Array.from({ length: n }, (_, i) => i);
  const used = Array<boolean>(n).fill(false);
  const blossom = Array<boolean>(n).fill(false);
  const lca = (first: number, second: number) => {
    const path = Array<boolean>(n).fill(false);
    let a = first, b = second;
    while (true) {
      a = base[a]; path[a] = true;
      if (match[a] === -1) break;
      a = parent[match[a]];
    }
    while (true) {
      b = base[b];
      if (path[b]) return b;
      b = parent[match[b]];
    }
  };
  const markPath = (start: number, root: number, child: number) => {
    let v = start;
    while (base[v] !== root) {
      blossom[base[v]] = blossom[base[match[v]]] = true;
      parent[v] = child;
      child = match[v]; v = parent[match[v]];
    }
  };
  const augment = (root: number) => {
    used.fill(false); parent.fill(-1);
    for (let i = 0; i < n; i++) base[i] = i;
    const queue = [root]; used[root] = true;
    for (let head = 0; head < queue.length; head++) {
      const v = queue[head];
      for (let u = 0; u < n; u++) {
        if (!edges[v][u] || base[v] === base[u] || match[v] === u) continue;
        if (u === root || (match[u] !== -1 && parent[match[u]] !== -1)) {
          const common = lca(v, u); blossom.fill(false);
          markPath(v, common, u); markPath(u, common, v);
          for (let i = 0; i < n; i++) if (blossom[base[i]]) {
            base[i] = common;
            if (!used[i]) { used[i] = true; queue.push(i); }
          }
        } else if (parent[u] === -1) {
          parent[u] = v;
          if (match[u] === -1) {
            let end = u;
            while (end !== -1) {
              const prev = parent[end];
              const next = prev === -1 ? -1 : match[prev];
              match[end] = prev;
              if (prev !== -1) match[prev] = end;
              end = next;
            }
            return;
          }
          const next = match[u]; used[next] = true; queue.push(next);
        }
      }
    }
  };
  for (let root = 0; root < n; root++) if (match[root] === -1) augment(root);
  return match;
}

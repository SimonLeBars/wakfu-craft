function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr: number[] = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = curr;
  }
  return prev[n];
}

function fuzzySubstring(needle: string, haystack: string): boolean {
  if (haystack.includes(needle)) return true;
  const threshold = needle.length <= 3 ? 0 : needle.length <= 6 ? 1 : 2;
  for (let i = 0; i < haystack.length; i++) {
    const maxLen = Math.min(haystack.length - i, needle.length + threshold);
    for (let len = Math.max(1, needle.length - threshold); len <= maxLen; len++) {
      if (levenshtein(needle, haystack.slice(i, i + len)) <= threshold) return true;
    }
  }
  return false;
}

export function fuzzyMatch(name: string, query: string): boolean {
  const nameClean  = normalize(name).replace(/[^a-z0-9]/g, '');
  const queryClean = normalize(query).replace(/[^a-z0-9]/g, '');
  if (!queryClean) return true;
  return fuzzySubstring(queryClean, nameClean);
}

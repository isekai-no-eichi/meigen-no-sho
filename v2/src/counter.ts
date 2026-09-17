// ============================================================
// 簡易アクセスカウンター（2026-09-17 KEI）
//   2026-09-17 簡略化: リンクは1本にしたので、流入元の振り分け（tiktok/instagram/other）は廃止。
//   数えるのは「何人来たか」= 鍵 `visits` の1本だけ。?from=... が付いていても無視する。
//   - 登録不要・無料の Abacus（abacus.jasoncameron.dev・旧 CountAPI の後継）を fetch で1回叩くだけ。
//     ※ /hit/{名前空間}/{鍵} が「無ければ作って +1」。/get/{名前空間}/{鍵} は数えずに現在値だけ返す。
//     CDN もスクリプトも足さない（fetch だけ）。
//   - 同じタブの連続リロードで水増ししないよう sessionStorage で1タブ1回だけ。
//     （localStorage の既存キー bookexp-* には一切触らない）
//   - 通信はすべて try/catch ＋ 3秒でタイムアウト。落ちても本の動作には一切影響しない。
//   - 数字の表示はルートの index.html（?stats）が受け持つ。本の中には何も出さない（2026-09-18 KEI）。
// ============================================================
const BASE = 'https://abacus.jasoncameron.dev';
// 本番（github.io）と手元の検証で名前空間を分ける。ローカルで試しても本番の数字は動かない
const NS = /github\.io$/i.test(location.hostname) ? 'kei-meigen-book' : 'kei-meigen-book-test';
const KEY = 'visits';                            // 2026-09-17: 1本だけ（旧 tiktok/instagram/other は廃止）
const SESSION_KEY = 'bookexp-hit-counted';      // sessionStorage 専用（localStorage とは別世界）
const TIMEOUT = 3000;

async function hit(url: string): Promise<number | null> {
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), TIMEOUT);
    const res = await fetch(url, { signal: ac.signal, cache: 'no-store', mode: 'cors' });
    clearTimeout(to);
    if (!res.ok) return null;
    const j = await res.json() as Record<string, unknown>;
    const n = (j && (j.value ?? j.count ?? (j.data as Record<string, unknown> | undefined)?.count)) as unknown;
    return typeof n === 'number' ? n : null;
  } catch { return null; }
}

/** 1タブ1回だけ +1。戻り値は使わない（失敗しても黙って終わる） */
async function bumpOnce(): Promise<void> {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch { /* プライベートブラウズ等。数えるだけ数えて終わる */ }
  await hit(`${BASE}/hit/${NS}/${KEY}`);
}

/** 読み込み時に1回だけ呼ぶ。中で全部握りつぶすので await も try も要らない */
export function initCounter(): void {
  try {
    // ?stats はKEIが数字を見に来る画面。表示はルートの index.html が受け持つ（2026-09-18）。
    // ここへ直接来た場合も、数えない・何も出さない
    if (new URLSearchParams(location.search).has('stats')) return;
    void bumpOnce();
  } catch { /* noop */ }
}

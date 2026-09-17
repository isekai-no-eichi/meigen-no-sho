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
//   - 表示は ?stats の時だけ。ふだんの読者には何も出さない。
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

/** ?stats の時だけ、今の訪問数を読んで画面の下に小さく出す */
async function showStats(): Promise<void> {
  const el = document.createElement('div');
  el.id = 'hits';
  el.textContent = '訪問を数えている…';
  document.body.appendChild(el);
  el.classList.add('show');
  let n = await hit(`${BASE}/get/${NS}/${KEY}`);
  if (n === null) {                                  // まだ鍵が作られていない＝訪問0。作ってから読み直す
    await hit(`${BASE}/create/${NS}/${KEY}`);
    n = await hit(`${BASE}/get/${NS}/${KEY}`);
  }
  el.textContent = n === null ? '訪問の記録が読めない' : `これまでの訪問 ${n}回`;
}

/** 読み込み時に1回だけ呼ぶ。中で全部握りつぶすので await も try も要らない */
export function initCounter(): void {
  try {
    // ?stats はKEIが数字を見に来る画面。ここで数えると自分の確認で数字が増えるので数えない
    if (new URLSearchParams(location.search).has('stats')) { void showStats(); return; }
    void bumpOnce();
  } catch { /* noop */ }
}

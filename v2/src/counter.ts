// ============================================================
// 簡易アクセスカウンター（2026-09-17 KEI）
//   - 登録不要・無料の Abacus（abacus.jasoncameron.dev・旧 CountAPI の後継）を fetch で1回叩くだけ。
//     ※ counterapi.dev は v1 が 410 で廃止・v2 は workspace 登録が要るため不採用（2026-09-17 実測）。
//     ※ /hit/{名前空間}/{鍵} が「無ければ作って +1」。/get/{名前空間}/{鍵} は数えずに現在値だけ返す。
//     CDN もスクリプトも足さない（fetch だけ）。
//   - 流入元を tiktok / instagram / other の3本に分けて数える。
//       ?from=tiktok / ?from=instagram が最優先。無ければ document.referrer で判定。
//   - 同じタブの連続リロードで水増ししないよう sessionStorage で1タブ1回だけ。
//     （localStorage の既存キー bookexp-* には一切触らない）
//   - 通信はすべて try/catch ＋ 3秒でタイムアウト。落ちても本の動作には一切影響しない。
//   - 表示は ?stats の時だけ。ふだんの読者には何も出さない。
// ============================================================
const BASE = 'https://abacus.jasoncameron.dev';
// 本番（github.io）と手元の検証で名前空間を分ける。ローカルで試しても本番の数字は動かない
const NS = /github\.io$/i.test(location.hostname) ? 'kei-meigen-book' : 'kei-meigen-book-test';
const KEYS = { tiktok: 'tiktok', instagram: 'instagram', other: 'other' } as const;
type Src = keyof typeof KEYS;
const SESSION_KEY = 'bookexp-hit-counted';      // sessionStorage 専用（localStorage とは別世界）
const TIMEOUT = 3000;

/** どこから来たか。?from= が最優先、次に referrer、どちらも無ければ other */
export function visitSource(): Src {
  try {
    const q = (new URLSearchParams(location.search).get('from') || '').toLowerCase();
    if (q.includes('tiktok')) return 'tiktok';
    if (q.includes('insta')) return 'instagram';
    const r = (document.referrer || '').toLowerCase();
    if (r.includes('tiktok')) return 'tiktok';
    if (r.includes('instagram') || r.includes('cdninstagram')) return 'instagram';
  } catch { /* noop */ }
  return 'other';
}

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
async function bumpOnce(src: Src): Promise<void> {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch { /* プライベートブラウズ等。数えるだけ数えて終わる */ }
  await hit(`${BASE}/hit/${NS}/${KEYS[src]}`);
}

/** ?stats の時だけ、3本の現在値を読んで画面の下に小さく出す */
async function showStats(): Promise<void> {
  const el = document.createElement('div');
  el.id = 'hits';
  el.textContent = '訪問を数えている…';
  document.body.appendChild(el);
  el.classList.add('show');
  const [tt, ig, ot] = await Promise.all([
    hit(`${BASE}/get/${NS}/${KEYS.tiktok}`),
    hit(`${BASE}/get/${NS}/${KEYS.instagram}`),
    hit(`${BASE}/get/${NS}/${KEYS.other}`),
  ]);
  if (tt === null && ig === null && ot === null) { el.textContent = '訪問の記録が読めない'; return; }
  const a = tt || 0, b = ig || 0, c = ot || 0;
  el.textContent = `TikTok ${a}回／Instagram ${b}回／その他 ${c}回／合計 ${a + b + c}回`;
}

/** 読み込み時に1回だけ呼ぶ。中で全部握りつぶすので await も try も要らない */
export function initCounter(): void {
  try {
    // ?stats はKEIが数字を見に来る画面。ここで数えると自分の確認で「その他」が増えるので数えない
    if (new URLSearchParams(location.search).has('stats')) { void showStats(); return; }
    void bumpOnce(visitSource());
  } catch { /* noop */ }
}

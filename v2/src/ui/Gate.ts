// ============================================================
// 合言葉のゲート（2026-09-21 KEI）
//   初回（localStorage bookexp-unlocked が無い時）だけ出る。
//     本は出さない（scale 0）。背景・ロウソク・塵はそのまま。
//     細い金の罫線の枠 →「合言葉は？」→ 下線だけの1行入力 →「ひらく」
//   間違い: 枠ごと左右に小さく揺れ、「合言葉が違います」を1.5秒。
//   正解  : 枠の縁を光が一周（0.9s）→ 枠が左右に割れて外へ（0.5s）→ 本が出現（BookScene.revealStart）
//   ?gate=1 で毎回出す（検証用）／?gate=0 で強制スキップ。?icon / ?stats には出さない。
// ============================================================
import { QP, isUnlocked } from '../state';

/** 合言葉の正解。変える時はここ1か所だけ直す */
export const PASSPHRASE = '？';

const SWEEP_MS = 900;      // 光が枠を一周する
const SPLIT_MS = 500;      // 枠が左右に割れて消える
const ERR_MS = 1500;       // 「合言葉が違います」を出しておく時間

function norm(s: string): string {
  let v = (s || '').trim();
  try { v = v.normalize('NFKC'); } catch { /* 古い端末 */ }
  return v;
}
/** 全角「？」・半角「?」のどちらも正解（NFKC で寄せる） */
export function matchPassphrase(input: string): boolean {
  return norm(input) !== '' && norm(input) === norm(PASSPHRASE);
}

/** この訪問で合言葉を出すか */
/** 販売開始まで既定OFF（?gate=1 でのみ表示）。発売時に true へ（2026-09-21） */
const GATE_DEFAULT = false;

export function gateNeeded(): boolean {
  if (QP.has('icon') || QP.has('stats')) return false;    // 撮影モード・集計画面には出さない
  const g = QP.get('gate');
  if (g === '1') return true;
  if (g === '0') return false;
  return GATE_DEFAULT && !isUnlocked();
}

export class Gate {
  private root: HTMLDivElement;
  private wrap!: HTMLDivElement;
  private input!: HTMLInputElement;
  private err!: HTMLElement;
  private errTimer: ReturnType<typeof setTimeout> | null = null;
  private done = false;

  /** @param onOpen 枠が割れ終わった時に呼ぶ（本を出しはじめる合図） */
  constructor(private onOpen: () => void) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
<div id="gate">
  <div class="gwrap">
    <div class="gpane l"></div><div class="gpane r"></div>
    <svg class="gsweep" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="99" height="99" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="gin">
      <div class="gq">合言葉は？</div>
      <input id="gateInput" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" aria-label="合言葉">
      <button class="gbtn" id="gateGo">ひらく</button>
      <div class="gerr" id="gateErr">合言葉が違います</div>
    </div>
  </div>
</div>`;
    this.root = wrap.firstElementChild as HTMLDivElement;
    document.body.appendChild(this.root);
    const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    this.wrap = this.root.querySelector('.gwrap') as HTMLDivElement;
    this.input = $<HTMLInputElement>('gateInput');
    this.err = $('gateErr');

    $('gateGo').addEventListener('click', () => this.submit());
    this.input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); this.submit(); }
      e.stopPropagation();                       // Enter/Space で本が開くのを止める
    });
    this.root.addEventListener('pointerdown', e => e.stopPropagation());
    this.root.addEventListener('pointerup', e => e.stopPropagation());
  }

  show(): void {
    requestAnimationFrame(() => {
      this.root.classList.add('show');
      try { this.input.focus({ preventScroll: true }); } catch { /* noop */ }
    });
  }

  private submit(): void {
    if (this.done) return;
    if (matchPassphrase(this.input.value)) { this.done = true; this.succeed(); }
    else this.fail();
  }

  private fail(): void {
    this.input.value = '';
    this.wrap.classList.remove('shake');
    void this.wrap.offsetWidth;                  // アニメーションを巻き戻す
    this.wrap.classList.add('shake');
    this.err.classList.add('show');
    if (this.errTimer) clearTimeout(this.errTimer);
    this.errTimer = setTimeout(() => this.err.classList.remove('show'), ERR_MS);
  }

  private succeed(): void {
    this.err.classList.remove('show');
    this.input.blur();
    this.input.disabled = true;
    this.root.classList.add('ok');               // 縁を光が一周する
    setTimeout(() => {
      this.root.classList.add('split');          // 枠が左右に割れる／中身が消える
      setTimeout(() => {
        this.root.classList.add('gone');
        this.onOpen();
      }, SPLIT_MS);
    }, SWEEP_MS);
  }
}

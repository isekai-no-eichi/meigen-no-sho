// ============================================================
// 本の画面のUI
//   下は縦1列（2026-09-17 KEI）: 上から
//     「この本の説明」  … 常時表示
//     「しおりから読む」「しおりを外す」 … しおりが1本でもある時だけ
//     「お気に入りを読む」            … お気に入りが1枚でもある時だけ
//   （2026-09-13 の「常時表示＋一言」は撤回。KEI: 入れた瞬間にボタンが増える形へ）
//   - 表示から2秒後、画面中央に細い金の罫線1本と一文「2回タップで、本を読む」
//   - 本を開くのはダブルタップ（400ms以内の2回）だけ。1回タップは何もしない。PC は Enter / Space でも開く
//   - 「この本の説明」= 羊皮紙の手紙（2026-09-17 KEI・黒革をやめた）。縦スクロール＋3ページ送り
// ============================================================
import { hasBookmark, favCount, clearBookmark, a2hsSeen, a2hsMark } from '../state';

const HINT_DELAY = 2000;
const DOUBLE_TAP = 400;   // 2026-09-09 KEI: 2回タップの猶予を広げる
const LETTER_PAGES = 3;

export interface UiHooks {
  onOpen: (mode: string, title?: string) => void;
  onToggleSound: () => void;
  onSay: (line: string) => void;
  onClearBookmark: () => void;
}

export class Ui {
  private hint: HTMLDivElement;
  private ui: HTMLDivElement;
  private menu: HTMLDivElement;
  private a2hs: HTMLDivElement;
  private bResume!: HTMLButtonElement;
  private bClearBm!: HTMLButtonElement;
  private bFav!: HTMLButtonElement;
  private letterBody!: HTMLElement;
  private fadeTop!: HTMLElement;
  private fadeBot!: HTMLElement;
  private hintTimer: ReturnType<typeof setTimeout> | null = null;
  private tabIdx = 0;
  private lastTap = 0;
  private locked = false;                       // 開く演出中・読書中は反応しない

  constructor(private hooks: UiHooks) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
<div id="hint"><div class="rule"></div><div class="txt">2回タップで、本を読む</div></div>
<div id="ui">
  <button class="seal wide" id="bInfo">この本の説明</button>
  <button class="seal wide" id="bResume" aria-label="しおりから読む" hidden>しおりから読む</button>
  <button class="seal wide" id="bClearBm" aria-label="しおりを外す" hidden>しおりを外す</button>
  <button class="seal wide" id="bFav" aria-label="お気に入りを読む" hidden>お気に入りを読む</button>
</div>
<div id="a2hs"><span>ホーム画面に追加すると、枠のない全画面で読める</span><button id="a2hsX" aria-label="閉じる">✕</button></div>
<div class="ov" id="menu"><div class="box letter frame">
  <div class="lwrap">
  <div class="lbody" id="letterBody">
  <div class="tab" data-tab="0">
    <p class="h">この本について</p>
    <p>私は長いあいだ、言の葉を集めてきた。<br>それを一冊に全て入れたのが、この本だ。</p>
    <p>ただの本ではない。<br>開くたびに、中身が変わる。<br>そして今も、増え続けている。</p>
    <p>この本に救われた人は、たくさんいる。</p>
    <p>失恋した人。<br>仕事がうまくいかなかった人。<br>生きる意味がわからなくなった人。<br>自ら命を絶とうとした人を、止めたことだってある。</p>
    <p>言葉には、それだけの力がある。</p>
    <p class="last">だから、悩んだとき、行き詰まったとき、この本を開いてほしい。<br>今のあなたにぴったりの一枚と、きっと出会えるはずだ。</p>
  </div>
  <div class="tab" data-tab="1" hidden>
    <p class="h">しおり</p>
    <p>途中で本を閉じたいときは、<br>画面の下にある<span class="k">【栞】</span>を押す。</p>
    <p>そのページに栞が挟まり、<br>次からは最初の画面にある<span class="k">【しおりから読む】</span>から続きを読めるようになる。</p>
    <p>最初の画面にある<span class="k">【しおりを外す】</span>を押せば、<br>挟んでいた栞を外すことができる。</p>
    <p class="last">その後は、また本を開くたびに名言の順番が変わる。</p>
  </div>
  <div class="tab" data-tab="2" hidden>
    <p class="h">お気に入り</p>
    <p>残しておきたい名言を見つけたら、<br>画面の下にある<span class="k">【印】</span>を押す。</p>
    <p>印をつけた名言は、<br>最初の画面にある<span class="k">【お気に入りを読む】</span>から、まとめて読み返すことができる。</p>
    <p>もう一度<span class="k">【印】</span>を押せば、その名言はお気に入りから外れる。</p>
    <p class="last">あとでまた読みたいと思った名言があれば使ってほしい。</p>
  </div>
  </div>
  <div class="lfade top" id="lfadeTop"></div>
  <div class="lfade bot" id="lfadeBot"></div>
  </div>
  <div class="lnav">
    <button class="lbtn" id="tabPrev">前のページ</button>
    <span class="lnum" id="tabNum">1 / ${LETTER_PAGES}</span>
    <button class="lbtn" id="tabNext">次のページ</button>
  </div>
  <button class="lclose" id="menuClose">本にもどる</button>
</div></div>`;
    while (wrap.firstElementChild) document.body.appendChild(wrap.firstElementChild);

    const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    this.hint = $('hint'); this.ui = $('ui'); this.menu = $('menu'); this.a2hs = $('a2hs');
    this.letterBody = $('letterBody');
    this.fadeTop = $('lfadeTop'); this.fadeBot = $('lfadeBot');
    // 本文が続いていることを示す上下の影（2026-09-17 KEI）。端まで来たらその側だけ消す
    this.letterBody.addEventListener('scroll', () => this.paintFades(), { passive: true });
    addEventListener('resize', () => this.paintFades());

    const stop = (e: Event) => e.stopPropagation();
    this.ui.addEventListener('pointerdown', stop);
    this.ui.addEventListener('pointerup', stop);
    $('bInfo').addEventListener('click', () => this.openMenu());
    $('menuClose').addEventListener('click', () => this.closeMenu());
    this.menu.addEventListener('click', e => { if (e.target === this.menu) this.closeMenu(); });
    $('tabPrev').addEventListener('click', () => this.showTab(this.tabIdx - 1));
    $('tabNext').addEventListener('click', () => this.showTab(this.tabIdx + 1));
    this.bResume = $<HTMLButtonElement>('bResume');
    this.bClearBm = $<HTMLButtonElement>('bClearBm');
    this.bFav = $<HTMLButtonElement>('bFav');
    this.bResume.addEventListener('click', () => {
      if (this.locked) return;
      if (hasBookmark()) this.hooks.onOpen('resume');
      else { this.updateEntry(); this.hooks.onSay('しおりは、まだ挟まれていません'); }
    });
    // しおりを外す＝しおりを全部消す。次に開く時はまたシャッフル（Reader.open が栞なしで混ぜ直す）
    this.bClearBm.addEventListener('click', () => {
      if (this.locked) return;
      clearBookmark();
      this.updateEntry();
      this.hooks.onClearBookmark();
      this.hooks.onSay('しおりを外した。次からはまた、開くたびに変わる');
    });
    this.bFav.addEventListener('click', () => {
      if (this.locked) return;
      if (favCount() > 0) this.hooks.onOpen('fav', 'お気に入りのページ');
      else { this.updateEntry(); this.hooks.onSay('お気に入りは、まだ登録されていません'); }
    });
    this.updateEntry();
    $('a2hsX').addEventListener('click', () => this.closeA2hs());
    // キーボードでも開ける（Enter / Space）。ボタンに焦点がある時は素通し
    addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      if (this.locked || this.menu.classList.contains('show')) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.tagName === 'A')) return;
      e.preventDefault();
      this.hint.classList.remove('show');
      this.hooks.onOpen('read');
    });
  }

  /**
   * 入口ボタンの出し入れ（2026-09-17 KEI）。
   *   「この本の説明」は常時。
   *   「しおりから読む」「しおりを外す」はしおりが1本でもある時だけ。
   *   「お気に入りを読む」はお気に入りが1枚でもある時だけ。
   */
  updateEntry(): void {
    const bm = hasBookmark();
    this.bResume.hidden = !bm;
    this.bClearBm.hidden = !bm;
    this.bFav.hidden = favCount() === 0;
  }

  /** 本が現れたら呼ぶ。UIを出し、しばらくして一文が浮かぶ */
  start(): void {
    this.updateEntry();
    this.showUi();
    this.hint.classList.remove('bye');
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => { if (!this.locked) this.hint.classList.add('show'); }, HINT_DELAY);
    setTimeout(() => this.maybeA2hs(), 1400);
  }
  setLocked(v: boolean): void {
    this.locked = v;
    if (v) { this.fadeHint(); this.hideUi(); this.closeMenu(); this.closeA2hs(); }
  }

  /** 開く時だけ、一文をすっと（0.6秒で）消す。ふだんの消え方は 1.6 秒のまま */
  fadeHint(): void {
    this.hint.classList.add('bye');
    this.hint.classList.remove('show');
  }

  /**
   * 本の画面のタップ。2回=開く。1回は何もしない。
   * ドラッグ（回転）と区別するため、呼ぶ側で「短く動かないタップ」だけを渡す。
   */
  tap(): void {
    if (this.locked || this.menu.classList.contains('show')) return;
    const now = performance.now();
    if (now - this.lastTap < DOUBLE_TAP) {
      this.lastTap = 0;
      this.fadeHint();
      this.hooks.onOpen('read');
      return;
    }
    this.lastTap = now;
  }

  showUi(): void { if (!this.locked) this.ui.classList.add('show'); }
  hideUi(): void { this.ui.classList.remove('show'); }

  openMenu(): void {
    if (this.locked) return;
    this.showTab(0);
    this.menu.classList.add('show');
    this.hint.classList.remove('show');
  }
  closeMenu(): void { this.menu.classList.remove('show'); }

  private showTab(n: number): void {
    this.tabIdx = (n + LETTER_PAGES) % LETTER_PAGES;
    document.querySelectorAll<HTMLElement>('#menu .tab').forEach(el => { el.hidden = +(el.dataset.tab || '0') !== this.tabIdx; });
    (document.getElementById('tabNum') as HTMLElement).textContent = (this.tabIdx + 1) + ' / ' + LETTER_PAGES;
    this.letterBody.scrollTop = 0;                 // ページを送ったら手紙の頭から
    this.paintFades();
    requestAnimationFrame(() => this.paintFades());   // 文字が組まれてから測り直す
  }

  /**
   * 本文の上下の影。まだ続きがある側だけ出す（2026-09-17 KEI）。
   *   下: 一番下まで読んだら消える。 上: 少しでもスクロールしたら出る。
   *   枠に収まっているページでは上下とも出ない。
   */
  private paintFades(): void {
    const el = this.letterBody;
    const rest = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.fadeBot.classList.toggle('show', rest > 8);
    this.fadeTop.classList.toggle('show', el.scrollTop > 8);
  }

  /** 本の画面に音のボタンは置かない（2026-09-09 KEI）。音の入切は読書画面の「音」ボタンで行う */
  paintSound(_on: boolean): void { /* noop */ }

  // ---- ホーム画面に追加の一言（スタンドアロンでない時・モバイルの時だけ1回きり） ----
  private maybeA2hs(): void {
    return;                                             // 2026-09-21 KEI: ホーム画面に追加の案内は出さない
    const standalone = (() => { try { return matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true; } catch { return false; } })();
    if (standalone || !/iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '')) return;
    if (a2hsSeen()) return;
    this.a2hs.classList.add('show');
    setTimeout(() => this.closeA2hs(), 12000);
  }
  private closeA2hs(): void {
    if (!this.a2hs.classList.contains('show')) return;
    this.a2hs.classList.remove('show'); a2hsMark();
  }
}

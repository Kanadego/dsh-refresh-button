// dsh-refresh-button 逻辑桩测试：最小 DOM/window/localStorage stub。
// 覆盖：注入、默认位置、单击刷新、拖拽锚定持久化、慢拖、F5/Ctrl+R、
// 误触发、重复注入防护、位置恢复与越界钳制、右键忽略、窗口缩放跟随、
// 旧版 {left,top} 存储迁移、body 未就绪延迟注入。
import fs from 'node:fs';

const code = fs.readFileSync(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8');
import { fileURLToPath } from 'node:url';

let failures = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  [' + extra + ']'));
  if (!cond) failures++;
}

// ── stub 环境 ────────────────────────────────────────────────────────────
function makeEnv({ storedPos = null, innerW = 1280, innerH = 800, bodyReady = true } = {}) {
  const store = new Map();
  if (storedPos) store.set('dsh-refresh-button.pos', JSON.stringify(storedPos));
  let reloadCount = 0;
  let rootEl = null;
  const winListeners = {};

  function makeEl() {
    const el = {
      id: '', style: {}, textContent: '', title: '', listeners: {},
      width: 30, height: 30,
      rect: { left: 1262, top: 762, width: 30, height: 30, right: 1292, bottom: 792 },
      setPointerCapture() {}, releasePointerCapture() {},
      addEventListener(type, fn) { (el.listeners[type] ??= []).push(fn); },
      fire(type, ev) { for (const fn of el.listeners[type] ?? []) fn(ev); },
      getBoundingClientRect() {
        const l = parseFloat(el.style.left) || el.rect.left;
        const t = parseFloat(el.style.top) || el.rect.top;
        return { left: l, top: t, width: 30, height: 30, right: l + 30, bottom: t + 30 };
      },
      get offsetWidth() { return el.width; },
      get offsetHeight() { return el.height; },
    };
    return el;
  }

  const window = {
    innerWidth: innerW, innerHeight: innerH,
    addEventListener(type, fn) { (winListeners[type] ??= []).push(fn); },
    fireKey(ev) { for (const fn of winListeners.keydown ?? []) fn(ev); },
    fireResize() { for (const fn of winListeners.resize ?? []) fn(); },
  };
  let bodyEl = bodyReady ? { appendChild(el) { rootEl = el; } } : null;
  const docListeners = {};
  const document = {
    get body() { return bodyEl; },
    set body(v) { bodyEl = v; },
    readyState: bodyReady ? 'complete' : 'loading',
    createElement: () => makeEl(),
    getElementById: (id) => (id === 'dsh-refresh-button-root' ? rootEl : null),
    addEventListener(t, f) { (docListeners[t] ??= []).push(f); },
  };
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  const location = { reload() { reloadCount++; } };

  let loadedDef = null;
  window.__ModuleLoader__ = { load(def) { loadedDef = def; } };
  const fn = new Function('window', 'document', 'localStorage', 'location', code);
  fn(window, document, localStorage, location);

  const mod = loadedDef.factory(() => {});
  return {
    apply: mod.apply, inject: mod.inject, win: window, doc: document,
    ls: localStorage, root: () => rootEl,
    reloads: () => reloadCount,
    savedPos: () => { const raw = localStorage.getItem('dsh-refresh-button.pos'); return raw ? JSON.parse(raw) : null; },
    fireDOMContentLoaded() { document.readyState = 'interactive'; document.body = { appendChild(el) { rootEl = el; } }; for (const f of docListeners.DOMContentLoaded ?? []) f(); },
  };
}

// ── 1. 注入与默认位置 ─────────────────────────────────────────────────────
{
  const env = makeEnv();
  env.apply();
  const btn = env.root();
  check('apply 后按钮被创建', !!btn);
  check('默认贴右下角', btn.style.right === '18px' && btn.style.bottom === '18px');
  check('inject 为空数组', Array.isArray(env.inject) && env.inject.length === 0);
  env.apply();
  check('重复 apply 不产生第二个按钮', env.doc.getElementById('dsh-refresh-button-root') === btn);
}

// ── 2. 单击（无位移）→ 刷新，恢复默认锚点 ─────────────────────────────────
{
  const env = makeEnv();
  env.apply();
  const btn = env.root();
  btn.fire('pointerdown', { button: 0, clientX: 1277, clientY: 777, pointerId: 1 });
  btn.fire('pointerup', { pointerId: 1 });
  check('干净单击触发刷新', env.reloads() === 1, 'reloads=' + env.reloads());
  check('单击不持久化位置', env.savedPos() === null);
  check('单击后仍贴 right/bottom 锚点', btn.style.right === '18px' && btn.style.bottom === '18px');
}

// ── 3. 拖拽（>4px）→ 边缘锚定持久化 + 不刷新 ───────────────────────────────
{
  const env = makeEnv();
  env.apply();
  const btn = env.root();
  // 拖到 (600, 300)：视口 1280x800，中心点 (615,315) 偏左上
  btn.fire('pointerdown', { button: 0, clientX: 1277, clientY: 777, pointerId: 1 });
  btn.fire('pointermove', { clientX: 615, clientY: 315 });
  btn.fire('pointerup', { pointerId: 1 });
  const saved = env.savedPos();
  check('拖拽后按最近边锚定持久化 left/top', !!saved && saved.ax === 'left' && saved.ay === 'top' && saved.ox === 600 && saved.oy === 300, JSON.stringify(saved));
  check('拖拽结束不触发刷新', env.reloads() === 0);
  check('松手后吸附回锚定位置', btn.style.left === '600px' && btn.style.top === '300px');
}

// ── 4. 拖到右下区域 → 锚定为 right/bottom ─────────────────────────────────
{
  const env = makeEnv();
  env.apply();
  const btn = env.root();
  btn.fire('pointerdown', { button: 0, clientX: 1277, clientY: 777, pointerId: 1 });
  btn.fire('pointermove', { clientX: 1289, clientY: 789 }); // nx=1274→钳到1242, ny=774→钳到762（位移超阈值）
  btn.fire('pointerup', { pointerId: 1 });
  const saved = env.savedPos();
  check('右下角拖拽锚定为 right/bottom (8,8)', !!saved && saved.ax === 'right' && saved.ay === 'bottom' && saved.ox === 8 && saved.oy === 8, JSON.stringify(saved));
}

// ── 5. 慢速拖拽（每帧 2px，累计位移）也判定为拖拽 ──────────────────────────
{
  const env = makeEnv();
  env.apply();
  const btn = env.root();
  btn.fire('pointerdown', { button: 0, clientX: 1277, clientY: 777, pointerId: 1 });
  for (let i = 1; i <= 10; i++) btn.fire('pointermove', { clientX: 1277 - i * 2, clientY: 777 });
  btn.fire('pointerup', { pointerId: 1 });
  const saved = env.savedPos();
  // 最终 nx = 1262-20 = 1242，中心 1257 偏右 → right 锚定 ox=1280-1272=8；oy: 顶部距离 762
  check('慢速拖拽被判定为拖拽并锚定', !!saved && saved.ax === 'right' && saved.ox === 8 && saved.oy === 8, JSON.stringify(saved));
  check('慢速拖拽不触发刷新', env.reloads() === 0);
}

// ── 6. 快捷键 ─────────────────────────────────────────────────────────────
{
  const env = makeEnv();
  env.apply();
  const mk = (props) => ({ cancelable: true, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...props });
  const f5 = mk({ key: 'F5' });
  env.win.fireKey(f5);
  check('F5 触发刷新并 preventDefault', f5.defaultPrevented === true);
  const cr = mk({ key: 'r', ctrlKey: true });
  env.win.fireKey(cr);
  check('Ctrl+R 触发刷新', cr.defaultPrevented === true);
  const r = mk({ key: 'r' });
  env.win.fireKey(r);
  check('裸 r 键不拦截', r.defaultPrevented === false);
  const f12 = mk({ key: 'F12' });
  env.win.fireKey(f12);
  check('F12 不被拦截', f12.defaultPrevented === false);
}

// ── 7. 存储位置恢复 + 越界钳制 + 旧格式迁移 ────────────────────────────────
{
  const env = makeEnv({ storedPos: { ax: 'left', ay: 'top', ox: 100, oy: 120 } });
  env.apply();
  const btn = env.root();
  check('锚定位置被恢复', btn.style.left === '100px' && btn.style.top === '120px' && btn.style.right === 'auto');
  const env2 = makeEnv({ storedPos: { ax: 'left', ay: 'top', ox: 5000, oy: -40 } });
  env2.apply();
  check('越界锚定被钳回视口内', env2.root().style.left === '1242px' && env2.root().style.top === '8px');
  const env3 = makeEnv({ storedPos: { left: 100, top: 120 } });
  env3.apply();
  check('旧版 {left,top} 存储迁移后恢复', env3.root().style.left === '100px' && env3.root().style.top === '120px');
}

// ── 8. 右键不启动拖拽 ─────────────────────────────────────────────────────
{
  const env = makeEnv();
  env.apply();
  const btn = env.root();
  btn.fire('pointerdown', { button: 2, clientX: 1277, clientY: 777, pointerId: 1 });
  btn.fire('pointermove', { clientX: 600, clientY: 300 });
  btn.fire('pointerup', { pointerId: 1 });
  check('右键拖动不影响位置', env.savedPos() === null && btn.style.right === '18px');
  check('右键交互不触发刷新', env.reloads() === 0);
}

// ── 9. 窗口缩放跟随 ───────────────────────────────────────────────────────
{
  // 默认右下锚点：缩小窗口后仍贴右下
  const env = makeEnv();
  env.apply();
  env.win.innerWidth = 800; env.win.innerHeight = 600;
  env.win.fireResize();
  check('默认锚点缩放后仍贴右下', env.root().style.right === '18px' && env.root().style.bottom === '18px');
}

{
  // 全尺寸下拖到左下 (600,300)，再缩窗：按钮保持贴左、top 不变
  const env = makeEnv();
  env.apply();
  const btn = env.root();
  btn.fire('pointerdown', { button: 0, clientX: 1277, clientY: 777, pointerId: 1 });
  btn.fire('pointermove', { clientX: 616, clientY: 316 });
  btn.fire('pointermove', { clientX: 615, clientY: 315 });
  btn.fire('pointerup', { pointerId: 1 });
  check('拖到左下后按左上锚定', env.savedPos().ax === 'left' && env.savedPos().ox === 600);
  env.win.innerWidth = 800; env.win.innerHeight = 600;
  env.win.fireResize();
  check('缩放后保持贴左（left 不变）', btn.style.left === '600px', 'left=' + btn.style.left);
  check('缩放后 top 不变（仍为顶部锚定）', btn.style.top === '300px', 'top=' + btn.style.top);
  // 极端缩小：按钮被钳回视野内
  env.win.innerWidth = 300;
  env.win.fireResize();
  check('极端缩放仍钳在视野内', parseFloat(btn.style.left) <= 300 - 30 - 8 && parseFloat(btn.style.left) >= 8, 'left=' + btn.style.left);
}

// ── 10. body 未就绪时延迟注入 ──────────────────────────────────────────────
{
  const env = makeEnv({ bodyReady: false });
  env.apply();
  check('body 未就绪时不注入按钮', env.root() === null);
  env.fireDOMContentLoaded();
  check('DOMContentLoaded 后完成注入', !!env.root());
  env.apply();
  check('延迟注入后防重复依然有效', !!env.root());
}

console.log(failures === 0 ? '全部通过' : failures + ' 项失败');
process.exit(failures === 0 ? 0 : 1);

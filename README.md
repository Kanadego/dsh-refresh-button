# dsh-refresh-button

给 DSH 桌面端补回网页刷新能力的极小插件（web 端装了也不碍事）。

## 背景

DSH 桌面端是 Electron 壳，但"刷新页面"菜单（`role: "reload"`，自带
F5 / Ctrl+R 加速键）只在 development 构建里注册，正式版什么都没有。

## 功能

- 悬浮 ⟳ 按钮：默认贴右下角，**可拖动**（位置记住在 localStorage），
  单击即整页刷新（等价 web 端按 F5）。
- 快捷键：`F5` / `Ctrl+R`（`Cmd+R`）恢复刷新，capture 阶段拦截。

## 结构

- `lib/index.js` — 宿主半边，空 `apply()`，只为让插件挂进 Loader
  （reasoning-slider 同款模式）。
- `lib/client.js` — ModuleLoader 工厂，`exports.inject = []`（不依赖任何宿主服务）；
  apply 内部等 `document.body` 就绪再注入（ModuleLoader 可能在 DOM 早期执行插件）。
- `cordis.patch.yml` — **`insert` 自身包名**。这一行不可省：loader 行是
  client-module 系统发现 `dsh.client` 声明、向页面下发 `lib/client.js`
  的依据；没有它 bundle 只会"已安装、重启后生效"地永远空转。

## 安装（本地插件，file: 依赖）

在目标 profile 的 `package.json`：

```json
"dependencies": { "dsh-refresh-button": "file:<本地项目目录>" },
"dsh": { "profile": { "bundles": [ "dsh-refresh-button" ] } }
```

然后 `pnpm install` 并重启 DSH。

## 兼容性

- 无 `peerDependencies`，宿主版本兼容检查直接通过。
- 纯 client 行为，无宿主 API 依赖，理论上跨 0.1.5 / 0.1.7 均可用。

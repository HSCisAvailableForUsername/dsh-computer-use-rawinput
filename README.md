# dsh-computer-use-rawinput

> A fork of [`@copylee/dsh-computer-use`](https://github.com/copylee711/dsh-computer-use) that fixes **synthetic mouse input being ignored by games and other Raw Input programs** on Windows.

[中文说明见下方](#中文说明) · MIT · Upstream version: 0.8.3

---

## The problem

The upstream plugin (and most desktop-automation stacks) moves the pointer like this:

```js
SetCursorPos(x, y);                     // teleport the OS cursor
SendInput(mouse, MOUSEEVENTF_MOVE, 0);  // zero-delta relative event
SendInput(mouse, MOUSEEVENTF_LEFTDOWN, 0);
SendInput(mouse, MOUSEEVENTF_LEFTUP, 0);
```

This is enough for normal desktop software (browsers, editors, Electron apps), because they read the cursor through the standard window messages. It is **not** enough for programs that read the pointer through **Raw Input / DirectInput** — most 3D games, game engines, and some kiosk/industrial apps:

- the click is delivered, but at the **previous** cursor position;
- hovering never updates, so menus do not highlight and tooltips do not appear;
- the application behaves as if the mouse were simply not there.

Keyboard input through `SendInput` keeps working, which makes the failure look like "clicks do not work in this one app" rather than "the input is synthetic".

## How this was diagnosed

The failure was isolated on a windowed 3D game on a mixed-DPI multi-monitor desktop:

1. `SendInput` keystrokes reached the game (an `Esc` key closed an in-game dialog) — so focus and integrity level were fine, and the target was not blocking injected input wholesale.
2. A click only worked when the *physical* cursor already happened to rest on the target — the click landed where the cursor was, not where the tool asked it to go.
3. Hover state never changed after a `mouse_move`, even though the reported cursor position did — the plugin's own `GetCursorPos` said `(x, y)` while the application still saw the old point.
4. The 0.8.3 `act` path (UIA `Invoke` / `SetFocus`) is not an option for these programs: a Direct3D game exposes no UI Automation tree at all.

The conclusion: `SetCursorPos` is a *teleport* that Raw Input consumers either never see or explicitly ignore, while `MOUSEEVENTF_ABSOLUTE` injected movement is delivered to them as real movement.

## The fix

Both input paths of the plugin (the koffi worker and the C# helper) now send an **absolute mouse move** before the click:

```
MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK   (0xC001)
```

with coordinates normalised to `0..65535` over the **physical virtual desktop**:

```
nx = round((x - vs.left) * 65535 / (vs.width  - 1))
ny = round((y - vs.top ) * 65535 / (vs.height - 1))
```

The order is: absolute move → `SetCursorPos` → zero-delta relative move → button events.

### Why the naive version does not work

The obvious implementation uses `GetSystemMetrics(SM_XVIRTUALSCREEN …)`. Inside a DPI-virtualised process those values are **virtualised** (scaled by the monitor DPI and clipped to the primary monitor), so the normalised coordinates map to the wrong point — on a two-monitor 125 %/150 % setup the pointer lands on a different monitor entirely.

This fork instead takes the union of the rectangles returned by `EnumDisplayMonitors` / `GetMonitorInfo` — the same physical geometry the screenshot code already uses — so the mapping is exact regardless of DPI awareness:

- `lib/native-worker.js`: `virtualScreen()` (cached, invalidated whenever `displays()` is re-enumerated)
- `helper/CuHelper.cs`: `Screen2.VirtualRect()`

Both files also keep the original `SetCursorPos` call, so behaviour for ordinary desktop apps is unchanged.

## What changed against upstream 0.8.3

See [`PATCH.md`](PATCH.md) (full `patch.diff` is in the repository root).

| File | Change |
|---|---|
| `lib/native-worker.js` | add `mouseAbs()`, `virtualScreen()`, send `0xC001` in `move()` |
| `helper/CuHelper.cs` | add `MOUSEEVENTF_ABSOLUTE`/`VIRTUALDESK`, `Screen2.VirtualRect()`, `Input.MouseAbs()`, use them in `Input.Move()` |

No other behaviour is modified.

## Install

The plugin is a drop-in replacement for the upstream package in a DSH profile:

```bash
# in your DSH profile directory
pnpm add github:Nontrivial-HSC/dsh-computer-use-rawinput
```

then point the profile patch entry at the forked package:

```yaml
- id: copylee-computer-use
  name: "@nontrivial-hsc/dsh-computer-use-rawinput"
  config:
    accessMode: per-app
    overlay: true
    # … the rest of your usual computer-use config
```

Restart DSH afterwards: the pointer code lives in a worker thread and in a helper process that is compiled on first use, so a restart is required.

To go back, reinstall `@copylee/dsh-computer-use` and restore the original entry name.

## Verifying it works

1. Open a windowed game (or any Raw Input app).
2. Ask the agent to hover a menu entry — the entry must highlight and its tooltip must appear.
3. Ask it to click through two menu levels — both clicks must land.

Keyboard-only games are unaffected either way.

## Limitations

- Windows only (`os: win32`), like upstream.
- The fix restores *pointer* delivery; it does not add game-specific support (Godot/Unity UI still need screenshots, and a game that reads only physical HID devices — anti-cheat protected titles, for example — may still reject injected input. Do not use this on online games with anti-cheat.)
- The plugin still sends `dwExtraInfo` for its own events, so a program can tell injected input apart if it wants to.

## Prior art

Absolute injected movement is not new: [`ltmroberthk915/dsh-computer-use`](https://github.com/ltmroberthk915/dsh-computer-use)
("dsh-codex-style-computer-use") animates the pointer with `MOUSEEVENTF_ABSOLUTE|VIRTUALDESK` as well, and sets its
process DPI awareness before doing so. Its scope is a full UIA-first control stack, though, and it does not document the
Raw Input / game case. This fork exists because `@copylee/dsh-computer-use` — the base many people already run — still
moves the pointer with a plain `SetCursorPos`, and because the difference only shows up in Raw Input consumers.

If you are choosing a plugin from scratch rather than patching this one, look at both and pick the one whose tool surface
you need; the pointer behaviour is no longer a reason to prefer either.
## Credits

- Upstream: [`copylee711/dsh-computer-use`](https://github.com/copylee711/dsh-computer-use) (MIT) — all of the plugin except the pointer movement change is theirs.
- The absolute-movement technique follows the documented Win32 `SendInput` behaviour; the virtual-desktop normalisation mirrors what the upstream screenshot code already computes.

## License

MIT — see [`LICENSE`](LICENSE). The upstream copyright notice is preserved. This fork was written by HSCisAvailableForUsername together with DeepSeek.

---

## 中文说明

### 问题

上游插件（以及大多数桌面自动化方案）移动鼠标的方式是：

```js
SetCursorPos(x, y);                     // 瞬移光标
SendInput(mouse, MOUSEEVENTF_MOVE, 0);  // 0 位移相对事件
// 然后按下/抬起
```

浏览器、编辑器、Electron 应用都正常，因为它们是靠标准窗口消息读光标的。但**靠 Raw Input / DirectInput 读鼠标的程序**——绝大多数 3D 游戏、游戏引擎、部分工控/自助机软件——看到的是：

- 点击被送到了，但落在**上一个**光标位置；
- 悬停永远不刷新，菜单不高亮、tooltip 不出现；
- 表现就像"这个程序里鼠标根本不存在"。

而键盘 `SendInput` 一直是好的，所以症状看起来特别像"这一个 App 的 bug"，而不是"输入是合成的"。

### 怎么定位到的

在一台混合 DPI 的多显示器桌面上、用窗口化 3D 游戏逐步排除：

1. `SendInput` 的按键能到达游戏（`Esc` 能关掉游戏内对话框）⇒ 焦点、权限、完整性级别都不是原因；
2. 只有**物理光标本来就在目标上**时点击才生效 ⇒ 点击落点 = 光标当前位置，而不是工具要求的坐标；
3. `mouse_move` 之后悬停状态从不变化，但插件自己 `GetCursorPos` 报的是新坐标 ⇒ 插件以为动了，程序没看到；
4. 0.8.3 新增的 UIA `Invoke` / `SetFocus` 路线对这类程序无效：Direct3D 游戏根本没有 UI Automation 树。

结论：`SetCursorPos` 是"瞬移"，Raw Input 消费者看不到；而 `MOUSEEVENTF_ABSOLUTE` 注入的**绝对移动**会被它们当成真实移动接收。

### 修复

两条输入路径（koffi worker 和 C# helper）在点击前都补一条绝对移动：

```
MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK   (0xC001)
```

坐标按**物理虚拟桌面**归一化到 `0..65535`，顺序是：绝对移动 → `SetCursorPos` → 零位移相对事件 → 按键事件。

**关键点**：朴素实现会用 `GetSystemMetrics(SM_XVIRTUALSCREEN …)`，但在被 DPI 虚拟化的进程里这些值会按显示器 DPI 缩放并裁到主屏，多显示器混合缩放时会把光标送到另一块屏幕上（这是踩过的坑）。本 fork 改用 `EnumDisplayMonitors` / `GetMonitorInfo` 返回矩形的并集——也就是截图代码早就在用的那套物理几何——因此映射精确。

### 安装 / 验证 / 限制

安装与配置同上（`pnpm add github:…` + 改 profile patch 里的包名，重启 DSH）。验证：在窗口化游戏里让 agent 悬停一个菜单项（应高亮并出 tooltip），再连点两层菜单。限制：仅 Windows；只解决"指针投递"，不提供游戏专用能力；带反作弊的在线游戏不要用。

### 致谢

上游 [`copylee711/dsh-computer-use`](https://github.com/copylee711/dsh-computer-use)（MIT）；除指针移动外的一切都是上游的工作。

# Changelog

## 0.8.3-rawinput.1

Fork of `@copylee/dsh-computer-use@0.8.3`.

- **Fixed**: injected mouse movement is now delivered to Raw Input / DirectInput
  consumers (games, 3D engines), so hover states update and clicks land on the
  requested coordinates instead of the cursor's previous position.
  - `lib/native-worker.js`: absolute `SendInput` move (`0xC001`) normalised over
    the physical virtual desktop, computed from `EnumDisplayMonitors`.
  - `helper/CuHelper.cs`: same change for the C# helper path.
- Nothing else is changed; ordinary desktop applications behave exactly as
  upstream.

Upstream history up to 0.8.3 is documented in
[`copylee711/dsh-computer-use`](https://github.com/copylee711/dsh-computer-use).

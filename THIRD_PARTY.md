# Licenses and Sources

The MetallKraft modifications in this repository are distributed under GPL-3.0. See [LICENSE](LICENSE). Existing third-party copyright notices and licenses are preserved. Brand names do not imply endorsement by the upstream projects or grant rights to their trademarks.

## ESP3D-WEBUI / FluidNC WebUI-3

- Authors: Luc Lebosse and contributors; FluidNC variant maintained by michmela44 and contributors.
- Release: [michmela44/ESP3D-WEBUI v3.0.10](https://github.com/michmela44/ESP3D-WEBUI/releases/tag/v3.0.10).
- Corresponding source commit: `90404559daf3178de1f55537137144fcb0424416`.
- Unmodified release artifact: `vendor/index.html.gz`.
- SHA-256: `46f6a276e1c4d17f17cfd6a5c48d44d5cb23ea16ce32e67194ee160951d030fa` (matches the upstream release asset digest).
- Complete upstream release source, including its license, notices, lockfile and build configuration: [`vendor/esp3d-webui-v3.0.10-source.tar.gz`](vendor/esp3d-webui-v3.0.10-source.tar.gz).
- Archive SHA-256: `f0bc0d805b192f6f45c970fb29f2348743bb824ec3bf55b02a0d69f27d664ea3`.
- `vendor/lang-ja.json` is the unchanged Japanese language file from that source release.

The upstream repository contains a GPL-3.0 root LICENSE and individual files with LGPL-2.1-or-later notices. Its package metadata says ISC; this distribution preserves the actual upstream license files and source notices instead of treating the metadata as permission to remove them.

Our modifications (2026-09-11): presentation, Japanese labels, panel layout, jog presets, spindle readout, SD file selection/start UI, read-only preview/tool-position/traversal and announcements. All modification sources and build scripts are included in `standard/`, `src/`, `build-standard.mjs` and `scripts/`. No FluidNC firmware binary or firmware source is included.

## Additional Bundled Libraries

| Library | Version | License |
| --- | --- | --- |
| lucide | 0.468.0 | [ISC](licenses/lucide.txt) |
| three | 0.180.0 | [MIT](licenses/three.txt) |
| gcode-toolpath | 3.0.0 | [MIT](licenses/gcode-toolpath.txt) |
| gcode-interpreter | See package-lock.json | [MIT](licenses/gcode-interpreter.txt) |
| gcode-parser | 2.2.0 | [MIT](licenses/gcode-parser.txt) |
| yaml | 2.9.1 | [ISC](licenses/yaml.txt) |

Bundled preview HTML also retains these license texts. Dependencies of the unmodified WebUI are identified in the included upstream source and package-lock.json. FluidNC itself is obtained separately from [bdring/FluidNC](https://github.com/bdring/FluidNC).

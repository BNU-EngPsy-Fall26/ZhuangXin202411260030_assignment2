# WebGazer 与 MediaPipe

WebGazer 3.5.3，Brown WebGazer Team，GPL-3.0-or-later。

固定官方提交：<https://github.com/brownhci/WebGazer/commit/b12701dd7b6d7b00d4b8dbebf87fdec840c24999>

`webgazer.js` 是原样保留的上游分发文件，`mediapipe/face_mesh/` 是同一提交内原样保留的运行资源。文件大小与 Git blob SHA-1 记录于 `upstream-manifest.json`。本项目未改写这些供应商文件。

`source/` 保存对应源代码与固定构建依赖清单；模型资源为避免重复存放，位于旁边的 `mediapipe/`。如需重建，把 `mediapipe/` 复制至 `source/src/mediapipe/`，在 `source/` 执行官方 README 的安装和构建流程。许可证见 `LICENSE.md`、`gplv3.md`。

MediaPipe Face Mesh 包版本为 0.4.1633559619，包声明 Apache-2.0。Apache 许可全文与附属声明来自官方仓库 <https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE>（读取文件 Git blob SHA-1：0e03e3911e0ac02c72ed527b34efe250f0fb9bef），存于 `mediapipe/LICENSE`。

`probe.html` 是本课程项目编写的检查页面入口，不属于上游 WebGazer。

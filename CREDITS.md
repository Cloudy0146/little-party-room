# Credits

## 字体

**Resource Han Rounded**（资源圆体）v0.990，作者 Cyano Hao，基于 Adobe 的 Source Han Sans。

- 来源：作者的官方 GitHub 发布页 https://github.com/CyanoHao/Resource-Han-Rounded/releases/tag/v0.990 （文件 `RHR-CN-0.990.7z`）
- 授权：SIL Open Font License 1.1，全文见 [licenses/ResourceHanRounded-OFL.txt](licenses/ResourceHanRounded-OFL.txt)
- 原字体带有保留字体名称（Reserved Font Name）"Source"。本网站使用的是子集化后的衍生版本，因此改名为 **PartyRound**，不使用原名。
- 生成方式：`scripts/build-font.mjs`（用 Medium 和 Bold 两个粗细，只保留网站用到的字）。

重新生成字体：把上面的压缩包解压，将 `ResourceHanRoundedCN-Medium.ttf` 和 `ResourceHanRoundedCN-Bold.ttf` 放到 `fonts-src/rhr/`，然后运行 `npm run font`。

## 3D 素材

目前全部由代码生成，没有使用外部素材。

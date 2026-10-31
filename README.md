# Project Pilot

面向软件项目的 AI 工作台。描述一个想法后，系统会拆分任务、推荐模型，并在隔离目录中执行、集成和验证。

注册和生成蓝图不需要 API Key。模型偏好可以随时修改，覆盖顺序是：单个任务 > 项目 > 账户默认。

## 运行

```powershell
npm install
npm test
npm run validate
npm run dev
```

打开 http://127.0.0.1:3210 。

作品介绍（背景、技术架构、应用场景、创新点）：[docs/作品介绍.md](docs/作品介绍.md)，PDF 为 [docs/作品介绍.pdf](docs/作品介绍.pdf)。

`npm run validate` 会生成 `examples/side-scroller`，这是一个可打开的小型横版游戏，用来验证任务拆分、模型推荐、并行隔离和自动验证。

## 范围

产品边界和术语见 [docs/SCOPE.md](docs/SCOPE.md)。

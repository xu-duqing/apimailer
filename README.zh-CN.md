# APIMailer Node.js SDK

[English](README.md) | [简体中文](README.zh-CN.md)

官网：https://apimailer.cc/

使用 JavaScript 或 TypeScript 调用 [APIMailer](https://apimailer.cc) 发送邮件。SDK 无运行时依赖，支持 Node.js 18 及以上版本，并同时提供 ESM、CommonJS 和完整类型声明。

## 安装

```bash
npm install @apimailer/sdk
```

## 快速开始

请将 API Key 放在服务端环境变量中，不要提交到代码仓库或暴露给浏览器。

```bash
export APIMAILER_API_KEY="mw_live_your_api_key"
```

```ts
import { APIMailer } from "@apimailer/sdk";

const mailer = new APIMailer({
  apiKey: process.env.APIMAILER_API_KEY!,
});

const result = await mailer.send({
  to: "user@example.com",
  subject: "Test Mail from APIMailer",
  body: "<p>This is a test email sent via APIMailer.</p>",
});

console.log(result);
```

CommonJS 项目可以这样使用：

```js
const { APIMailer } = require("@apimailer/sdk");

const mailer = new APIMailer({
  apiKey: process.env.APIMAILER_API_KEY,
});
```

## 配置

```ts
const mailer = new APIMailer({
  apiKey: process.env.APIMAILER_API_KEY!,
  timeout: 15_000, // 默认 10 秒，设为 0 可禁用超时
  // baseUrl: "https://apimailer.cc", // 使用代理或测试服务时可覆盖
});
```

单次请求也可以覆盖超时或通过 `AbortSignal` 主动取消：

```ts
const controller = new AbortController();

await mailer.send(
  {
    to: "user@example.com",
    subject: "Hello",
    body: "<p>Hello from APIMailer.</p>",
  },
  {
    timeout: 5_000,
    signal: controller.signal,
  },
);
```

## 错误处理

网络错误、超时、请求取消以及非 2xx API 响应都会抛出 `APIMailerError`。HTTP 错误还包含状态码、服务端响应和可选的请求 ID。

```ts
import { APIMailerError } from "@apimailer/sdk";

try {
  await mailer.send({
    to: "user@example.com",
    subject: "Hello",
    body: "<p>Hello.</p>",
  });
} catch (error) {
  if (error instanceof APIMailerError) {
    console.error(error.code, error.status, error.requestId);
    console.error(error.response);
  }
  throw error;
}
```

常见 SDK 错误码：

- `HTTP_ERROR`：API 返回了非 2xx 状态（如果 API 返回自己的 `code`，将优先使用它）
- `NETWORK_ERROR`：无法连接 API
- `TIMEOUT`：请求超过配置的超时时间
- `ABORTED`：调用方取消了请求

## API

### `new APIMailer(options)`

- `apiKey`：必填，APIMailer API Key
- `baseUrl`：可选，默认 `https://apimailer.cc`
- `timeout`：可选，默认 `10000` 毫秒；设为 `0` 禁用
- `fetch`：可选，自定义 fetch-compatible 实现

### `mailer.send(email, options?)`

`email` 包含三个必填字符串字段：`to`、`subject`、`body`。`body` 可以是 HTML。

### `createClient(options)`

`new APIMailer(options)` 的便捷工厂函数。

## 开发

```bash
npm install
npm test
npm run typecheck
npm pack --dry-run
```

## License

MIT

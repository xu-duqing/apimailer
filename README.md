# APIMailer Node.js SDK

[English](README.md) | [简体中文](README.zh-CN.md)

Send email through [APIMailer](https://apimailer.cc) from JavaScript or TypeScript. The SDK has no runtime dependencies, supports Node.js 18 and later, and includes ESM, CommonJS, and TypeScript declarations.

## Features

- Small, zero-runtime-dependency client
- First-class TypeScript support
- ESM and CommonJS entry points
- Configurable request timeouts and cancellation with `AbortSignal`
- Structured errors for API, network, timeout, and cancellation failures

## Installation

```bash
npm install @apimailer/sdk
```

## Quick start

Store your API key in a server-side environment variable. Never commit it to source control or expose it in browser code.

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

For CommonJS projects:

```js
const { APIMailer } = require("@apimailer/sdk");

const mailer = new APIMailer({
  apiKey: process.env.APIMAILER_API_KEY,
});
```

## Configuration

```ts
const mailer = new APIMailer({
  apiKey: process.env.APIMAILER_API_KEY!,
  timeout: 15_000, // Defaults to 10 seconds; use 0 to disable
  // baseUrl: "https://apimailer.cc", // Override for a proxy or test server
});
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `apiKey` | `string` | Required | Your APIMailer API key |
| `baseUrl` | `string` | `https://apimailer.cc` | API origin or proxy URL |
| `timeout` | `number` | `10000` | Timeout in milliseconds; `0` disables it |
| `fetch` | `APIMailerFetch` | Global `fetch` | Optional fetch-compatible implementation |

You can override the timeout for one request or cancel it with an `AbortSignal`:

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

## Error handling

Network errors, timeouts, cancellations, and non-2xx API responses throw an `APIMailerError`. HTTP errors also include the status code, server response, and request ID when available.

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

SDK error codes:

- `HTTP_ERROR`: the API returned a non-2xx status. An API-provided `code` takes precedence when present.
- `NETWORK_ERROR`: the SDK could not reach the API.
- `TIMEOUT`: the request exceeded its configured timeout.
- `ABORTED`: the caller cancelled the request.

## API reference

### `new APIMailer(options)`

Creates an APIMailer client using the options described above.

### `mailer.send(email, options?)`

Sends an email through the `/send` endpoint. `email` contains three required string fields:

- `to`: recipient email address
- `subject`: subject line
- `body`: plain text or HTML email body

The optional second argument accepts `timeout` and `signal`.

If your application knows the exact API response shape, you can provide it as a generic type:

```ts
type SendResult = { id: string; success: boolean };

const result = await mailer.send<SendResult>({
  to: "user@example.com",
  subject: "Hello",
  body: "<p>Hello.</p>",
});
```

### `createClient(options)`

A convenience factory equivalent to `new APIMailer(options)`.

## Development

```bash
npm install
npm test
npm run typecheck
npm pack --dry-run
```

## License

MIT

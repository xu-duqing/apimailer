import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

import APIMailerDefault, {
  APIMailer,
  APIMailerError,
  createClient,
} from "../dist/index.js";

function response(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? "OK",
    headers: {
      get(name) {
        return name.toLowerCase() === "x-request-id"
          ? (options.requestId ?? null)
          : null;
      },
    },
    async text() {
      return body;
    },
  };
}

describe("APIMailer", () => {
  it("sends the expected authenticated JSON request", async () => {
    let captured;
    const mailer = new APIMailer({
      apiKey: "test_key",
      baseUrl: "https://example.test/",
      fetch: async (url, init) => {
        captured = { url, init };
        return response('{"success":true,"id":"mail_123"}');
      },
    });

    const email = {
      to: "user@example.com",
      subject: "Hello",
      body: "<p>Hello.</p>",
    };
    const result = await mailer.send(email);

    assert.deepEqual(result, { success: true, id: "mail_123" });
    assert.equal(captured.url, "https://example.test/send");
    assert.equal(captured.init.method, "POST");
    assert.deepEqual(captured.init.headers, {
      Authorization: "Bearer test_key",
      "Content-Type": "application/json",
    });
    assert.deepEqual(JSON.parse(captured.init.body), email);
    assert.ok(captured.init.signal instanceof AbortSignal);
  });

  it("returns plain text and null response bodies without failing", async () => {
    const responses = [response("accepted"), response("")];
    const mailer = new APIMailer({
      apiKey: "test_key",
      fetch: async () => responses.shift(),
    });

    assert.equal(
      await mailer.send({ to: "a@b.co", subject: "Hi", body: "Hi" }),
      "accepted",
    );
    assert.equal(
      await mailer.send({ to: "a@b.co", subject: "Hi", body: "Hi" }),
      null,
    );
  });

  it("throws an APIMailerError with API details", async () => {
    const errorBody = { message: "Invalid recipient", code: "BAD_TO" };
    const mailer = new APIMailer({
      apiKey: "test_key",
      fetch: async () =>
        response(JSON.stringify(errorBody), {
          ok: false,
          status: 422,
          statusText: "Unprocessable Entity",
          requestId: "req_123",
        }),
    });

    await assert.rejects(
      mailer.send({ to: "invalid", subject: "Hi", body: "Hi" }),
      (error) => {
        assert.ok(error instanceof APIMailerError);
        assert.equal(error.message, "Invalid recipient");
        assert.equal(error.status, 422);
        assert.equal(error.code, "BAD_TO");
        assert.equal(error.requestId, "req_123");
        assert.deepEqual(error.response, errorBody);
        return true;
      },
    );
  });

  it("validates client options and email fields", async () => {
    assert.throws(() => new APIMailer({ apiKey: "" }), /apiKey/);
    assert.throws(
      () => new APIMailer({ apiKey: "key", baseUrl: "not-a-url" }),
      /baseUrl/,
    );
    assert.throws(
      () => new APIMailer({ apiKey: "key", timeout: -1 }),
      /timeout/,
    );

    const mailer = new APIMailer({
      apiKey: "test_key",
      fetch: async () => response("{}"),
    });
    await assert.rejects(
      mailer.send({ to: "", subject: "Hi", body: "Hi" }),
      /Email to/,
    );
  });

  it("wraps network failures", async () => {
    const original = new Error("socket closed");
    const mailer = new APIMailer({
      apiKey: "test_key",
      fetch: async () => {
        throw original;
      },
    });

    await assert.rejects(
      mailer.send({ to: "a@b.co", subject: "Hi", body: "Hi" }),
      (error) => {
        assert.ok(error instanceof APIMailerError);
        assert.equal(error.code, "NETWORK_ERROR");
        assert.equal(error.cause, original);
        return true;
      },
    );
  });

  it("supports timeouts and caller cancellation", async () => {
    const waitForAbort = async (_url, init) =>
      new Promise((resolve, reject) => {
        if (init.signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }

        init.signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    const mailer = new APIMailer({ apiKey: "test_key", fetch: waitForAbort });
    const email = { to: "a@b.co", subject: "Hi", body: "Hi" };

    await assert.rejects(mailer.send(email, { timeout: 5 }), (error) => {
      assert.equal(error.code, "TIMEOUT");
      return true;
    });

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      mailer.send(email, { signal: controller.signal, timeout: 0 }),
      (error) => {
        assert.equal(error.code, "ABORTED");
        return true;
      },
    );

    const delayedAbortMailer = new APIMailer({
      apiKey: "test_key",
      fetch: async (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener(
            "abort",
            () => {
              setTimeout(
                () => reject(new DOMException("Aborted", "AbortError")),
                10,
              );
            },
            { once: true },
          );
        }),
    });
    const delayedController = new AbortController();
    const delayedRequest = delayedAbortMailer.send(email, {
      signal: delayedController.signal,
      timeout: 2,
    });
    delayedController.abort();

    await assert.rejects(delayedRequest, (error) => {
      assert.equal(error.code, "ABORTED");
      return true;
    });
  });

  it("exports default, factory, and CommonJS entry points", () => {
    assert.equal(APIMailerDefault, APIMailer);
    assert.ok(createClient({ apiKey: "test_key" }) instanceof APIMailer);

    const require = createRequire(import.meta.url);
    const commonjs = require("../dist/index.cjs");
    assert.equal(typeof commonjs.APIMailer, "function");
    assert.equal(commonjs.default, commonjs.APIMailer);
  });
});

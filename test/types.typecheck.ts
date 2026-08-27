import {
  APIMailer,
  APIMailerError,
  createClient,
  type APIMailerFetch,
  type SendEmailRequest,
  type SendEmailResponse,
} from "../src/index.js";

const mailer: APIMailer = createClient({
  apiKey: "type_test_key",
  fetch: globalThis.fetch,
});

const email: SendEmailRequest = {
  to: "user@example.com",
  subject: "Type test",
  body: "<p>Hello.</p>",
};

const customFetch: APIMailerFetch = async () =>
  new Response('{"success":true}', {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const customClient = new APIMailer({
  apiKey: "type_test_key",
  fetch: customFetch,
});

async function checkTypes(): Promise<void> {
  const result: SendEmailResponse = await mailer.send(email);
  const customResult = await customClient.send<{ queued: boolean }>(email);

  if (result.success && customResult.queued) {
    const error: APIMailerError = new APIMailerError("type test", {
      code: "TYPE_TEST",
    });
    console.log(error.code);
  }
}

void checkTypes;

import {
  APIMailer,
  type SendEmailRequest,
} from "../dist/index.cjs";

const mailer = new APIMailer({ apiKey: "type_test_key" });
const email: SendEmailRequest = {
  to: "user@example.com",
  subject: "CommonJS type test",
  body: "<p>Hello.</p>",
};

void mailer.send(email);

# Devpost submission — Countersign

Use this as the English project description. Paste the sections into the matching Devpost fields. The "Built with" line also fits the tools field.

Suggested project name: **Countersign**

Suggested tagline: An AI purchasing agent that cannot move PayPal money until a named human countersigns.

## Inspiration

Small teams are starting to let an assistant buy supplies, software, and services. The dangerous version of that assistant can talk itself into a charge: it invents a price, skips the person who was supposed to approve it, and leaves no record of who agreed.

We wanted the opposite default. The agent may draft a purchase. It may not decide the price, and it may not move money. A named person countersigns the exact total. PayPal creates an order only after that signature, and capture is a second step. The receipt is the proof, not a screenshot of a chat.

That is the whole product: the agent proposes, a human approves, the receipt proves it.

## What it does

Countersign is a web app for a team lead who wants help drafting a purchase and does not want an agent with a blank check.

You describe the need in plain English. "2 standing desks and a monitor arm for the design team, keep it under $1000." The agent turns that into line items from a fixed catalog. Unit prices come from the catalog on the server. If the draft is over the budget you stated, quantities are reduced before you ever see a pay button. If you ask for something that is not on the catalog, such as a yacht, there is nothing to sign and PayPal is never called.

You can lower a quantity. You cannot raise it on the approval screen, because that would let a later edit outgrow the draft. You type your name and check an explicit consent line. Until both are present, the countersign button stays off.

Countersign then creates a PayPal Sandbox order with Orders v2. The screen shows the order id and says that capture has not been called. In demo mode, a clearly labeled button simulates buyer approval through the same gate. With sandbox credentials, that button is a redirect to PayPal. When the sandbox buyer approves, PayPal returns to the app and the app captures the order. If the buyer cancels, or if capture is attempted too early, the order stays uncaptured and the audit log says why.

The receipt records the original request, the approver, the time, a SHA-256 hash of the signed lines and prices, the PayPal order id, the capture id, and the ordered list of events from request to capture.

Demo mode runs the entire path with no API keys, so a judge can install the repository and use it. Sandbox mode uses the same buttons and the real Sandbox API.

## How we built it

The app is a Next.js and TypeScript server. Drafts, countersignatures, and receipts live in a small JSON file on disk so a refresh does not erase the audit.

The drafting step has two implementations behind one function. With `LLM_API_KEY` set and demo mode off, the server calls an OpenAI-compatible chat completions endpoint and asks for JSON: a memo, catalog SKUs, and quantities. With no key, a deterministic parser matches the same catalog, including quantities and a stated budget. After either drafter returns, the server throws away any price the model tried to send, drops unknown SKUs, applies the budget, and hashes the priced draft.

The payment step is also one interface with two implementations. The Sandbox gateway gets an OAuth token from `https://api-m.sandbox.paypal.com`, creates an order with `intent: CAPTURE`, and captures it only when the receipt is already countersigned. The order body puts `return_url` and `cancel_url` on `payment_source.paypal.experience_context`, and the item total is checked against the sum of the lines before the request is sent. Amounts stay in integer cents until the moment they are formatted for PayPal. The demo gateway validates that same body, then returns a demo order id and, only when capture is called, a demo capture id.

`DEMO_MODE=true` forces both demo implementations even if keys are present, which keeps a recording from creating sandbox charges by accident. `PAYPAL_ENV` must be `sandbox`. A live value is rejected.

Vitest covers the parser, the human gate, the order math, and the Sandbox client against a fake `fetch`. `npm run smoke` runs propose, countersign, and capture in demo mode.

## Challenges

PayPal's buyer approval and our human approval are different steps, and it was tempting to collapse them. Capture fails with `ORDER_NOT_APPROVED` if the sandbox buyer has not approved the order yet. We kept that failure visible: the receipt stays uncaptured, the audit log records the block, and the person can open the approval link again. The countersignature is what allows an order to exist. The PayPal login is what allows capture.

The other hard line was money. A model that can emit a dollar amount can be persuaded to change it. So the model is not allowed to send the price that gets charged. It can only name catalog SKUs and quantities, and a person can only reduce those quantities before signing.

Demo mode had to be honest. A banner that pretends a charge happened would not satisfy the hackathon, and it would not be a useful test. The demo gateway implements the same create-then-capture sequence and refuses to capture an order that was never created.

## Accomplishments

- A complete purchase path: natural language, catalog-priced draft, named countersignature, PayPal order, separate capture, and a receipt.
- A PayPal Sandbox Orders v2 client that creates and captures orders, with the approval redirect and cancel path.
- A demo mode that exercises that same control flow with no secrets, so judges can run the project from the README.
- Server-side checks that block capture without a countersignature, block a second capture, block a raised quantity, and block an off-catalog draft.
- An audit log a person can read, tied to a hash of the signed payload.

## What we learned

An agent that can pay is mostly a permissions problem. The interesting work is not the prompt. It is making the payable amount boring and traceable: catalog price, a name, a hash, an order id, a capture id, in that order.

We also learned to keep PayPal's order state and our approval state apart. "The human said yes" is not the same event as "PayPal captured the funds," and the receipt is clearer when it lists them separately.

## What's next

The next useful controls are a second approver above a threshold, a merchant-managed catalog instead of the built-in list, and PayPal webhooks so a capture completed outside the return URL still lands on the receipt. We would also show the sandbox buyer which order they are approving in a short plain-language summary. We would not turn on live payments until that audit trail had been reviewed for a real merchant account. This hackathon build stays on Sandbox.

## Built with

- Next.js
- React
- TypeScript
- PayPal Sandbox Orders v2
- PayPal Sandbox OAuth 2.0
- An OpenAI-compatible chat completions API (optional; the demo parser runs without it)
- Zod
- Vitest

## Tools field

If Devpost asks which AI tool was used and how: the runtime calls any OpenAI-compatible chat completions API configured with `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL`. The model only selects catalog SKUs and quantities. The server prices the invoice. When no model key is configured, the same invoice path is handled by the built-in deterministic parser so the PayPal gate can still be demonstrated. PayPal integration is the Sandbox Orders v2 API: create order after countersignature, capture after buyer approval.

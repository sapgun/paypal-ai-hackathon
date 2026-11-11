# Demo video script

Target length: **2 minutes 40 seconds**. The hackathon limit is 3 minutes. Judges may stop at 3:00.

Record a desktop browser at 1280×720 or 1920×1080. Use your own voice. No background music, no stock footage, and no third-party logos. Do not show `.env.local`, a client secret, or a sandbox password.

## Before you hit record

1. `npm install`, then `cp .env.example .env.local`, then `npm run dev`.
2. Open http://localhost:3000 and confirm both badges say **demo** if you are using the reliable path below.
3. Close extra tabs. Hide bookmarks that contain account names.
4. Practice the click path once. The first example chip drafts the invoice by itself.
5. Optional sandbox swap: if you want the PayPal window in the video, log into the sandbox personal account before recording, set `DEMO_MODE=false` with real sandbox keys, restart the server, and confirm the PayPal badge says **sandbox**. Do not type the password on camera. That swap replaces shot 5 only.

## Shot list

### 0:00–0:12 — The rule

On screen: the Countersign home page. Both mode badges are readable.

Say:

> Countersign is a purchasing agent for a small team. It can draft an order. It cannot spend until a named person countersigns, and PayPal does not capture until after that.

### 0:12–0:22 — Who it is for

Stay on the same page. Gesture at the three lines at the bottom if they are in frame.

Say:

> A team lead can ask for supplies in plain English. The agent does not get to invent the price. The catalog does.

### 0:22–0:48 — Draft

Click the chip **Desks for the design team**. Wait until the invoice appears.

Say:

> Two standing desks and a monitor arm, for the design team, under a thousand dollars. The draft is nine hundred twenty-nine dollars. Those are the catalog prices, and the note says the draft fits the budget.

Point at the catalog price column and the budget note. Do not open the browser console.

### 0:48–1:12 — The gate

Point at the disabled **Countersign** button. Click **+** on Standing desk once, so it is obvious the quantity will not go up. Then type `Jordan Lee` in Approver name and check the consent box. The button enables. Do not click it yet.

Say:

> I can lower a quantity. I cannot raise the charge from this screen. The button stays off until I put my name on the invoice and explicitly consent. That consent is what allows a PayPal order to exist.

### 1:12–1:32 — Order created, not captured

Click **Countersign**. Wait for the panel that says no money has moved.

Say:

> The order now exists. The stamp says uncaptured. Capture has not been called. This is the gap an agent should not be able to skip.

Point at the order id.

### 1:32–1:52 — Buyer approval

Demo path: click **Approve as sandbox buyer (demo)**.

Say:

> This recording is in demo mode, so buyer approval is simulated. The button is labeled demo. With sandbox keys, this same step redirects to PayPal, and the return URL performs the Orders v2 capture.

Sandbox swap, only if the badge already says sandbox and you are already logged in: click **Continue to PayPal Sandbox**, approve the prefilled sandbox checkout, and land back on the receipt. If the PayPal window is slow, skip the explanation and let the return speak for itself. Cut this shot before 1:55.

### 1:52–2:22 — The receipt

Scroll so the approver, the capture id, the signed hash, and the audit log are all visible. Pause on the audit list.

Say:

> The receipt keeps the request, the approver, the hash of the signed lines, the PayPal order, and the capture id. Create and capture are separate lines in the log. That is the proof.

### 2:22–2:40 — What it will not do

Click **Off catalog**. Wait for the empty result.

Say:

> Ask for something that is not on the catalog, and there is nothing to sign. No PayPal order is created. The agent proposes. A person approves. The receipt proves it.

End on that invoice, or cut back to the paid receipt if you have the tab. Stop the recording. Do not add a title card with a PayPal logo.

## Upload

- YouTube visibility: **Public** or **Unlisted** is not enough if the hackathon asks for public. Set the video to **Public**.
- Title example: `Countersign — PayPal AI Hackathon demo`
- Description: one or two sentences plus the GitHub repository URL. No soundtrack credits for music you did not make, because there should be no music.
- Put the YouTube URL in the Devpost submission. The spoken script above is about 330 words, which reads in roughly two and a half minutes.

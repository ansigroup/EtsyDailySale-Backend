# Frontend integration task: Paddle checkout update

The `/api/subscription/create` endpoint now only responds with a Paddle `priceId` instead of the full checkout payload. Update the client to build the checkout session on the frontend with Paddle.js.

## Tasks for frontend
- Update the subscription flow to call `/api/subscription/create` and read `priceId` from the JSON response (`{ ok: true, priceId: "..." }`).
- Initialize Paddle.js with your client-side token and desired defaults (for example, theme, locale, and logout settings) using `Paddle.Initialize({ checkout: { settings: { ... } } })`.
- When the user clicks the upgrade/checkout button, call `Paddle.Checkout.open({ settings: { items: [{ priceId, quantity: 1 }], ... } })` using the `priceId` returned by the server and any checkout settings required by the design (display mode, theme, locale, etc.).
- Ensure the inline/overlay container IDs and styles match the Paddle documentation requirements (e.g., `frameTarget`, `frameInitialHeight`, `frameStyle`).
- Adjust any existing UI logic that expected the server to return Paddle tokens or customer objects; those values must now be managed solely on the client side.

Refer to the Paddle manual for full checkout settings (displayMode, frameTarget, theme, locale, allowLogout, etc.) when configuring the client-side checkout behavior.

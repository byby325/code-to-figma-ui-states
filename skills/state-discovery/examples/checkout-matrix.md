# Shop Checkout · State matrix (example)

An illustrative example of what a matrix looks like; file paths and line numbers are made up.

- Code source: shop-web `main`
- Scope: from the cart to a placed order. Excludes sign-in and order history
- Spec source: Jira AC (CHK-12 to CHK-18)
- Device: mobile 375 × 812
- Coverage summary: **Prototype 11 · Gaps 5 (In spec 2 · Suggested 3)**

Paths in the Basis column are relative to the repo root.

## Prototype

### 01 · Cart (C)

| ID | Name | Trigger; result | Basis |
|---|---|---|---|
| C01 | Default | 3 items in the cart; each row shows image, name, unit price and quantity, with the subtotal and checkout button at the bottom | CartPage.vue:12-48 |
| C02 | Empty cart | No items; illustration + "Your cart is empty" + a "Keep shopping" button, checkout button hidden | CartPage.vue:5-10 |
| C03 | First load | Cart data not back yet; item rows replaced by 3 skeleton rows | CartPage.vue:3, CartSkeleton.vue |
| C04 | Out of stock | One item has 0 stock; that row turns grey and shows "Notify me", checkout still works but the item isn't charged | CartItem.vue:30-44 |
| C05 | Quantity limit | Quantity equals the limit of 5 per customer; "+" turns grey, with "Limit 5 per customer" below | CartItem.vue:52-60 |
| C06 | Long name | Product name runs past two lines; the second line ends in an ellipsis, the full name is on the product page | CartItem.vue:22 (line-clamp-2) |

### 02 · Checkout form (CO)

| ID | Name | Trigger; result | Basis |
|---|---|---|---|
| CO01 | Prefilled | A saved address exists; shipping details are prefilled and the last payment method is selected | CheckoutForm.vue:18-40 |
| CO02 | Required field empty | Phone is empty on Place order; the phone field gets a red border + "Enter a phone number", and the page scrolls to it | CheckoutForm.vue:72-90 |
| CO03 | Submitting | Waiting for the response after Place order; the button becomes a spinner and can't be pressed again, the form is read-only | CheckoutForm.vue:95-104, useSubmit.ts:8-20 |

### 03 · Order result (R)

| ID | Name | Trigger; result | Basis |
|---|---|---|---|
| R01 | Order placed | API returns 201; the confirmation page shows the order number and estimated delivery date | OrderDone.vue:4-30 |
| R02 | Payment failed | API returns 402; a red notice above the form says "Payment didn't go through. Try another payment method.", entered data is kept | CheckoutForm.vue:110-118 |

## Gaps

### 04 · Gap check (G)

| ID | Name | Tag | Trigger; result | Basis |
|---|---|---|---|---|
| G01 | Invalid promo code | In spec | An expired or unknown promo code is entered; the reason shows below the field, the subtotal doesn't change | CHK-15 |
| G02 | Sold out during checkout | In spec | An item sells out right as the order is submitted; say which item sold out, return to the cart and keep the other items | CHK-17 |
| G03 | Network down | Suggested | The connection fails on submit; the prototype's `catch` only logs to the console and the screen keeps spinning | useSubmit.ts:22-25 |
| G04 | Double submit | Suggested | The response is slow, the user reloads and submits again; nothing prevents duplicates, so two orders can be created | useSubmit.ts:8-20 |
| G05 | Session expired | Suggested | The token expires after a long idle; a 401 from the API isn't handled. Inferred from the category: every form that needs sign-in needs this | Category inference: submitting the form requires sign-in |

On a zh-TW board the tags read 規格有寫 (In spec) and 建議補 (Suggested), and the summary reads 原型 11 · 缺漏 5（規格有寫 2 · 建議補 3）.

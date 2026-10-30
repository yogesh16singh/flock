# How the Urja Meter Ops portal behaves

Notes from 30 Oct 2026. I logged into https://urja-ops.flockenergy.tech as the operator and followed what the pages actually request. curl for the JSON, and the JS bundles the browser loads for the export button. I didn't click anything that writes.

## What it is

It is a SvelteKit app. The pages that matter are `/login`, `/meters`, `/meters/{meterId}`, and `/transformers`. The HTML shells are thin. The lists and the export button call JSON under `/portal/...` from the client bundles:

- The meters page fetches `/portal/meters/search?q=&page=`.
- The meter page fetches `/portal/meters/{id}/geo` and `/portal/meters/{id}/energy`. Nameplate and hierarchy are already in the server payload for that page.
- The transformers page fetches `/portal/dts?page=`. The "Export all meters" button fetches `/portal/keys`, then a signed `/portal/export`.

Sign-out is `POST /api/auth/sign-out`. The catalog does not call it. The account is shared.

## Authentication

`POST /login` as `application/x-www-form-urlencoded` with `email` and `password`.

SvelteKit rejects the form action unless both of these are set:

- `Origin: https://urja-ops.flockenergy.tech`
- `x-sveltekit-action: true`

Without a matching Origin the status is `403` and the body is the text `Cross-site POST form submissions are forbidden`.

Success is HTTP 200, not a followed redirect:

```json
{"type":"redirect","status":303,"location":"/meters"}
```

and

```text
Set-Cookie: __Secure-better-auth.session_token=...; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=Lax
```

There is no CSRF token in the form.

`GET /api/auth/get-session` right after login showed `expiresAt` exactly one hour after `createdAt`. The cookie `Max-Age` is 3600. I did not hold a session open long enough to prove whether later activity slides that hour. The client treats it as a fixed hour: it logs in again a minute before the cookie expires, and again if a portal call returns 401.

`GET /portal/meters/search` with no cookie returns:

```json
{"error":"unauthorized","message":"A valid session is required."}
```

## Fleet export

The transformers bundle builds the signature like this (method, path, query, unix seconds, joined by newlines):

```text
GET
/portal/export
page=1
<unix seconds>
```

HMAC-SHA256, key is `data.signingSecret` from `GET /portal/keys`, digest is lowercase hex. The request is `GET /portal/export?page=1` with headers `x-timestamp` and `x-signature`.

A bad signature returns `401` with `error: "signature_invalid"`. The secret is handed to any logged-in browser. This service uses it the way that button does and does not store it.

I signed `page=2` and `page=1&limit=1` as well. Both came back `total: 403` and all 403 meters. The query string is part of the signature, and the handler ignores pagination.

Each exported meter has:

- `meterId` from `J100000` through `J100402`
- `serialNo`
- `make`: HPL 90, Genus 88, Secure 85, Allied 76, L&T 64
- `phaseType`: `single` 277, `three` 126
- `installStatus`: Installed 238, Faulty 90, Decommissioned 75
- `installType`: Whole Current 205, CT Operated 198
- `build`: `legacy` 238, `v2` 165
- `dtCode`
- `hierarchy` with `zone`, `circle`, `division`, `subdivision`, `substation`, `feeder`, `dt`, each `{code, name}`
- `geo` as `{lat, lng}` numbers

There are 3 zones (`Z-01`, `Z-02`, `Z-03`) and 40 distribution transformers. 39 transformers have 10 meters. `DT-007` has 13.

Every coordinate sits in a box around Jaipur: latitude about 26.79–27.04, longitude about 75.66–75.91.

## Distribution transformers

`GET /portal/dts?page=1` returns `{data, total, page, pageSize}`. Page size is 20, total is 40. Page 2 is the rest. Page 3 is `data: []` with the same total.

Fields: `code`, `name`, `feederCode`, `capacityKva`. Capacities I saw were 63, 100, 160, 250, and 400.

## Search and the per-meter calls

`GET /portal/meters/search?q=&page=1` is 20 rows and `total: 403`. `q` matches meter id or serial, case-insensitive: `j100001` finds `J100001`, and `SE33962` finds one meter. Page 99 returns `data: []`, `total: 403`, `page: 99`.

Search rows are only the nameplate plus `dtCode`. They do not include hierarchy or coordinates.

`GET /portal/meters/J100000/geo` returns `latitude` and `longitude` as strings. The export uses numeric `lat` and `lng` for the same point.

`GET /portal/meters/NOPE/energy` returns `404` with `error: "not_found"`.

## Readings are cumulative registers

`GET /portal/meters/{id}/energy` takes optional `from` and `to` as `YYYY-MM-DD`.

Rows look like `{"timestamp":"23/06/2026 23:30","kwh":"48438.74","kvah":"52313.84","voltR":"226"}`. All four values are strings. The UI prints a dash when a string is empty. The June window I pulled for `J100040` had no empty kWh.

There is no timezone on the timestamp.

Samples from this session:

- `J100000` and `J100039`, default window: 337 rows from `23/06/2026 23:30` to `30/06/2026 23:30`, stepping 30 minutes.
- `J100000` for `from=2026-06-10&to=2026-06-10`: 48 rows, `00:00` through `23:30`.
- `J100040` and `J100100`, default window: 8 rows at midnight, `23/06/2026` through `30/06/2026`.
- `J100040` for the whole of June: 30 midnight rows, `01/06/2026` through `30/06/2026`.

In those samples `kwh` only moves up by a small step, so it is a cumulative register, not the energy used in that interval. The first 40 ids I checked are half-hourly. Later ids I checked are daily. I did not download a series for every meter.

`from` after `to` (`2026-06-12` to `2026-06-10`) returns `200 {"data":[]}`. A range in July does the same. `from=garbage` is ignored and the default window comes back (337 rows for `J100000`). The portal does not say the parameter was bad. This API does not pass a bad date through.

## Hierarchy is messy

Short codes are not unique. `D-01` sits under more than one circle. The same pattern shows up for subdivision, substation, and feeder. A node is the full code path, not the short code.

22 meters have a blank `code` or a blank `name` on one level:

- circle: 6 blank codes, 5 blank names
- feeder: 5 blank codes, 3 blank names
- substation: 3 blank codes

`J100011` has circle name `Circle 6` and an empty code. `J100051` on the same `DT-012` has `C-06` / `Circle 6`. `J100162` has feeder code `F-003` and an empty name, and another meter on `DT-003` has the name. Every blank in this export can be filled from another meter on the same `dtCode` that has both code and name. I did not find a blank with two disagreeing complete answers on that transformer.

`DT-007` is a name clash, not a blank. The registry says `Sanganer DT 7`, feeder `F-007`, 63 kVA. Ten meters agree. `J100400`, `J100401`, and `J100402` say `Old Malviya Nagar Xfmr` with the same code and the same feeder. The catalog keeps the registry name and stores the other name as an alias.

## Detail pages this service does not parse

`/meters/{id}/__data.json` is SvelteKit's devalue payload, not plain JSON.

- `legacy`, for example `J100000`: `detail.data` is rows of `{parameterName, parameterValue}`.
- `v2`, for example `J100004`: `detail.classData` is a JSON string `{"installed_meter":{"MeterId","SerialNo",...}}`.

Hierarchy on that page is a display string such as `Jaipur Zone 2 (Z-02)`. The UI drops a level when the name is empty, so the page can hide a code the export still has. The export already carries nameplate, hierarchy, and coordinates, so the running service does not parse these payloads. If the signed export stopped working, this page would be the fallback, and it would be worse data.

## What I did not do

I did not send a bad password, did not sign the shared account out, and did not try to find a rate limit by flooding the portal. The client still caps itself at 90 portal requests a minute and, on HTTP 429, waits two seconds and retries that call once.

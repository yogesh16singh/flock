# Urja Catalog API

Read-only API over the Urja Meter Ops portal. The site has no API, so this logs in as the operator, pulls the fleet from the same export the transformers page uses, and keeps a catalog in MongoDB.

You can list meters, walk the network, open a transformer, ask what's near a point, and pull a register series without using the portal.

How the portal works is in [PROTOCOL.md](PROTOCOL.md). The API contract is [openapi.json](openapi.json). With the server running, the same spec is at `/docs`.

## Layout

```text
src/portal/        session cookie, signed export, DT pages, on-demand registers, request pace
src/catalog/       normalize, hierarchy repair, generation sync, register parsing and cache
src/store/mongo.ts meters, transformers, network_nodes, register_cache, sync_state
src/http/          one router per resource
src/schemas.ts     Zod schemas shared by the handlers and the OpenAPI document
src/openapi.ts     OpenAPI 3.1 generator
src/server.ts      Express, problem+json errors, Scalar
```

Portal JSON is not the response model. Names are normalised, blank hierarchy levels are repaired only when the rest of that transformer agrees, and cumulative `kwh` stays a register. `intervalKwh` is computed here.

## Run

Requires Node.js 20+, npm, and a MongoDB server already listening on the URI in `.env` (default `mongodb://127.0.0.1:27017/urja_catalog`). Start that server with `mongod` however you usually run it. This repo does not start a database for you.

```bash
cp .env.example .env
```

Set `CATALOG_PORTAL_EMAIL` and `CATALOG_PORTAL_PASSWORD` in `.env` to the operator account from the brief. Do not commit `.env`.

```bash
npm install
npm start
```

The process listens on `http://127.0.0.1:8080`. Interactive docs are at `http://127.0.0.1:8080/docs`. The first catalog load logs in and pulls the fleet. Later requests reuse that generation until `CATALOG_TTL_SECONDS` (default 900) and then refresh in the background of the next call.

`npm test` does not need a running MongoDB or the live portal. It uses an in-memory MongoDB and a fake portal.

`npm run openapi` rewrites `openapi.json` from the Zod schemas.

## Sample request

After the catalog has loaded:

```bash
curl -s 'http://127.0.0.1:8080/v1/meters?status=faulty&limit=2'
curl -s 'http://127.0.0.1:8080/v1/meters/J100000'
curl -s 'http://127.0.0.1:8080/v1/meters/J100000/registers?from=2026-06-10&to=2026-06-10'
curl -s 'http://127.0.0.1:8080/v1/transformers/DT-007'
curl -s 'http://127.0.0.1:8080/v1/places?lng=75.83&lat=26.94&radiusM=1000'
curl -s 'http://127.0.0.1:8080/v1/signals'
```

A meter list looks like:

```json
{
  "asOf": "2026-10-30T11:00:00.000Z",
  "stale": false,
  "items": [
    {
      "meterId": "J100000",
      "serialNumber": "SE33962",
      "make": "HPL",
      "phase": "single",
      "status": "decommissioned",
      "installType": "whole_current",
      "transformerCode": "DT-001",
      "path": "Z-01/C-01/D-01/SD-01/SS-01/F-001/DT-001"
    }
  ],
  "nextCursor": null
}
```

`nextCursor` is an opaque cursor. Pass it back as `cursor`. Pages are ordered by meter id.

Errors use `application/problem+json` (`title`, `status`, `detail`). A bad or reversed date is `422`. The portal would have ignored it and returned a different window.

`POST /v1/catalog/rebuild` forces a reload. There is no auth on that route. It is a local tool. A shared deployment would put a token in front of it.

## Assumptions

- Portal timestamps are India time, `+05:30`. Nothing in the payload says so. The meters I looked at are in Jaipur, and `CATALOG_PORTAL_UTC_OFFSET_MINUTES` can change the assumption.
- The signed export is the fleet source of truth. Search rows and the per-meter geo call are subsets of it. I checked that the geo endpoint's string coordinates match the export's numbers for `J100000`.
- The distribution-transformer registry wins on DT name. `DT-007` is `Sanganer DT 7` in the registry and `Old Malviya Nagar Xfmr` on three meters. Both names are kept. The resolved meter uses the registry name.
- One operator account sees the whole fleet. This service does not try to act as more than one user.
- A faulty share of 0.4 or more on a transformer is worth a signal. That cutoff is local. The portal has no such report.
- The session lasts one hour from login. I only sampled `expiresAt` immediately after login.

## Design decisions and trade-offs

Mongo is just a database you already have running. 403 nameplates don't need one. I used it anyway because a network prefix, a status filter, and "within this radius" are then ordinary queries, and a register series I've already fetched doesn't have to hit the portal again. Locations are GeoJSON so a `2dsphere` index can do the radius. That's more index than this fleet needs. It starts to hurt if every half-hour for every meter sits in `register_cache` for months. I'd keep daily rollups hot and put the raw series somewhere else. Before that, energy has no bulk export and this client stays at 90 portal calls a minute, so a full backfill is minutes of waiting either way.

A refresh writes a new generation, flips `sync_state`, then deletes the old one. If the portal errors and we already have a generation, that one stays and the response is marked `stale`. If we have never loaded anything, the call is a 503 rather than an empty list.

Hierarchy repair is conservative. A blank code or name is filled only when the other meters on that same transformer have one agreed complete pair. The original blank stays on `networkRaw`, and `issues` records `repaired:<level>` or `missing:<level>`. Short codes repeat under different parents, so the public id of a node is the full path (`Z-01/C-01/...`).

Register calls require real `from` and `to` dates. The portal silently substitutes its default window for garbage. This API returns `422` instead. `kwh` is returned as `registerKwh`. `intervalKwh` is the difference from the previous point, and it is null on the first point and when the register goes backwards.

The portal client is one shared login, single-flight so concurrent 401s do not stampede, paced at 90 requests per minute. I did not measure the portal's ceiling.

## Left out on purpose

- No UI. I spent the time on the catalog and the portal notes.
- I didn't parse the SvelteKit meter page. The export already has the fields, and that page drops a hierarchy level when the name is blank. I'd only go there if the export signature broke.
- No auth on this API, no Redis, no queue.
- I don't download registers for all 403 meters on startup. There's no bulk energy call, and it would sit on the portal for a few minutes.

## With more time

Put a token on `POST /v1/catalog/rebuild`. Keep a saved export fixture and run a contract check against the live portal outside CI. Backfill registers slowly, under the same pace limit. Ask someone at the utility whether those timestamps are actually IST. A map of `/v1/places` plus the signals list would be the UI I'd add after that.

## Reflection

I assumed the export was the full fleet, that a blank on a transformer can be filled from the other meters on that same DT, and that coordinates in Jaipur mean the timestamps are IST (`+05:30`). The 0.4 faulty-share line is mine. I also treated the session as a fixed hour because `expiresAt` was exactly an hour after `createdAt` when I checked, right after login. I didn't watch a session age.

The export was the annoying part. Nothing in the UI documents it. The transformers bundle (`nodes/4.*.js`) does `GET /portal/keys` and then HMAC-SHA256 of method, path, query, and the unix time. I first looked for hierarchy fields on the meter itself and thought every level was missing. They're nested under `hierarchy`. The geo endpoint also disagrees with the export: strings named `latitude`/`longitude` versus numbers named `lat`/`lng`. Once that was straight, the blank levels and the DT-007 name clash were different problems.

Another day I'd backfill registers, lock the rebuild route, and check the timezone with someone who owns the data.

I mis-read a signature failure. A call signed for `page=2` came back `signature_invalid`, and I wrote that down as portal behaviour. The headers had gone in the wrong place in the client. Sent again, `page=2` returns the same 403 meters. Pagination is ignored. The query string still has to be what you signed.

If I were reviewing this I'd say Mongo is a lot of machinery for 403 meters, nothing in CI talks to the real portal, and 90 requests a minute is a number I picked. The repair rule is also only as good as today's data: if two meters on one DT ever disagree and both look complete, I will leave the blank instead of guessing. That didn't happen in this export.

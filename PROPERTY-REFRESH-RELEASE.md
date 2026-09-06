# Hourly Property Snapshots

Owner approved a separate hourly exporter on 2026-09-06. It does not restart
Minecraft, force chunks/saves/renders, change money, or deploy the website.
Server package: season-0-economy-server/deploy/property-refresh-20260906/.

## Delivery Contract

`/property-runtime/current.json` is proxied to the existing public economy host.
The exporter validates all parcel captures, native masks, rendered meshes,
textures and worth data before committing immutable hash assets, then atomically
switches the manifest. It contains one coherent catalog/mesh/worth/material-value
generation. No raw NBT, inventory contents, member lists or tenant identities.

The browser checks at startup, every five minutes while visible, and when made
visible again. Failed or older generations cannot replace its last verified data.
An open preview stays pinned to the generation it opened with. Automatic feed
failure falls back to the verified bundled release; the age/failure is visible.
Listing save times, capture times, rendered-surface retrieval and worth times are
different observations. Hourly capture does not force BlueMap to render changes.

## Card Value Correction

Freehold cards now show original ARM assessment plus known captured material worth,
using the same BOM calculation as the detail view. The original assessment or
asking price remains separately labeled. Rentals are not summed with capital.
Budget/sort controls explicitly retain the original asking/assessment or weekly
rent basis. Assessment is not established as land-only; overlap is disclosed.
Static r008 is $60,000.00 + $10,285.27 = $70,285.27; r009 is
$60,000.00 + $18,410.09 = $78,410.09. Each card uses its own captured material tally.

## Release / Rollback

Website rollback base is `d5a21232ea60cf9ad658fffd34da306194084b74` (PR2).
Disabling the property exporter timer leaves the current public generation live.
Disable it before a reviewed exporter code upgrade; never replace game scripts.
Private generation records support a verified manifest rollback. Public assets are
bounded to 512 MiB; only old unreferenced hash assets are eligible for collection.

Production rehearsal and timer enable evidence are recorded in the server repo,
not inferred from local tests. The first rehearsal failed closed on the VPS's
HTTP 403 response to its own worth feed. The corrected exporter uses the same
public worth file locally and BlueMap's loopback public server, without changing
firewall, proxy, TLS or authentication configuration.

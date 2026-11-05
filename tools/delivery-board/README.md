# Internal delivery board

Separate from the Machines & Cloud customer application. This read-only board projects `deliveryBoard` from the existing `product/LAUNCH-CONTROL.json`. Product/Delivery owns that canonical section; task owners report actual work and QA evidence before its status advances.

Run with Node (no new dependencies):

```sh
MC_DELIVERY_SOURCE=/Users/stevengoumnai/Desktop/Repositories/machines-and-cloud/product/LAUNCH-CONTROL.json node tools/delivery-board/server.mjs
```

Open `http://127.0.0.1:4573`. `MC_DELIVERY_PORT` can select another local port. The server binds only to loopback, rejects other hosts/origins, exposes only fixed assets and an allowlisted task projection, and accepts no writes. It never serves evidence files, provider captures, credentials or the full launch-control record.

The board refreshes every 2.5 seconds while visible. Real status changes move cards; it never simulates work, starts agents, or marks delivery successful. Complete means verified at the card's stated scope; release status remains separate. Teams, search, task details, acceptance criteria, evidence summaries and recorded activity are available. Failed refreshes retain the last view and show recovery status.

## Surface contract

Operate mode; existing blue/navy Machines & Cloud identity. One status board with compact cards, team filters and a separate detail page. Mobile stacks the lanes and replaces the team sidebar with a selector. Keyboard access, visible focus, retained filters and reduced motion are required. No new visual-world exercise, image generation, paid product, third-party account or public deployment is needed.

The view follows familiar status-grouped boards and progressive task detail, informed by Linear's official board documentation. It inherits the existing `PRODUCT.md` and `DESIGN.md`; it does not replace their design system. The Impeccable context launcher was unavailable (permission denied); project context and the craft/Operate references were read directly.

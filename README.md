# STAS OPEX Analytics (Bahrain Warehouse V2)

Local-first static analytics dashboard for Epicor "Analyse PDR" exports.

## Run
1. `npm install`
2. `npm run dev`
3. `npm run build`

## Deployment
Build static assets using `npm run build` and host `dist/` on any static server.

## Data import and cache
- Use **Dataset Manager** page to import `.xlsx/.xlsm/.csv`.
- Data is cached in IndexedDB automatically.
- Export/import `.staspack` bundles (`data.arrow` + `meta.json` in ZIP format).

## Core rules implemented
- Amount <= 0 excluded.
- Missing cost excluded from profit/margin calculations.
- STAS fiscal year uses May-Apr boundary (FY is ending year).
- Order counts dedupe by `(OrderNum, PartNum)` and use first invoice date FY attribution.

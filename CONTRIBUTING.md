# Contributing

All data is plain YAML in `data/`. Every page on the site links to the file that holds its record.

## Rules

1. **Cite a source for every change.** Use a constitutional article, Act, Gazette notification, Cabinet Division or Establishment Division notification, or an official website. Add it to `sources`, `legal_basis`, or the tenure's `source`.
2. **Date officeholders.** Update `as_of` when you confirm a holding. When someone leaves a post, set `until` on their role. Don't delete it; past holders are part of the record.
3. **Mark uncertainty.** Use `confidence: medium` or `low` when you can't cite a primary source.
4. **Use acting / additional charge.** If an officer holds a post on additional charge, record `status: additional_charge`.
5. **Keep IDs stable.** Never rename an `id`. To record a renamed or merged body, add the new one and link it with `successor_of`, then set `abolished` on the old one.

## Workflow

```bash
npm install
npm run validate   # schema + referential integrity
npm test           # data and query tests
npm run dev        # local site at http://localhost:5173
```

## Where things go

| Data | File |
|---|---|
| Laws and constitutional provisions | `data/laws.yaml` |
| Provinces, territories, divisions and districts | `data/jurisdictions.yaml` |
| Federal constitutional core (President, PM, Parliament, courts, ECP, AGP, armed forces) | `data/federal/core.yaml` |
| Federal ministries and divisions | `data/federal/ministries.yaml` |
| Federal attached bodies, regulators and SOEs | `data/federal/attached-bodies.yaml` |
| Health vertical (NHSR&C and its bodies) | `data/federal/health.yaml` |
| Each province | `data/provinces/<province>.yaml` |
| Gilgit-Baltistan, AJK | `data/territories/*.yaml` |
| Officeholders | `data/people.yaml` |

See [docs/DATA_MODEL.md](docs/DATA_MODEL.md) for the schema and conventions.

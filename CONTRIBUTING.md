# Contributing

All data is plain YAML in `data/`. Every page on the site links to the file that holds its record.

## Rules

1. **Cite a source for every change.** Use a constitutional article, Act, Gazette notification, Cabinet Division or Establishment Division notification, or an official website. Add it to `sources`, `legal_basis`, or the tenure's `source`.
2. **Date officeholders.** Update `as_of` when you confirm a holding. When someone leaves a post, set `until` on their role. Don't delete it; past holders are part of the record.
3. **Mark uncertainty.** Use `confidence: medium` or `low` when you can't cite a primary source.
4. **Use acting / additional charge.** If an officer holds a post on additional charge, record `status: additional_charge`.
5. **Follow the editorial policy** ([docs/EDITORIAL_POLICY.md](docs/EDITORIAL_POLICY.md)). Never cite Wikipedia or another encyclopedia. Record people only in their public roles. Declared assets must cite the ECP. Family ties need an official source or two independent outlets, and both people must hold a public or party office. The build rejects records that break these rules.
6. **Keep IDs stable.** Never rename an `id`. To record a renamed or merged body, add the new one and link it with `successor_of`, then set `abolished` on the old one.

To record an MNA or MPA, add a role with the seat ID, e.g. `{ position: seat-na-122, since: "2024-02-29" }`. Seat IDs follow the ECP constituency codes (`seat-pp-159`, `seat-ps-77`, `seat-pk-70`, `seat-pb-10`).

By contributing data you agree that it is released under CC BY 4.0 ([LICENSE-DATA](LICENSE-DATA)); code contributions are under the MIT licence ([LICENSE](LICENSE)).

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
| Officeholders (with `party:` set to a party id) | `data/people.yaml` |
| Seat rosters for every legislature, Senate seat groups | `data/legislatures.yaml` |
| Political parties | `data/parties.yaml` |
| Additional federal regulators, professional bodies, tribunals, ombudsmen | `data/federal/regulators.yaml` |
| City and cantonment local governments | `data/local-government.yaml` |

See [docs/DATA_MODEL.md](docs/DATA_MODEL.md) for the schema and conventions.

# Declared assets (ECP Form-B statements)

Every candidate files a statement of assets and liabilities (Form-B) with their nomination papers (Elections Act 2017, s. 60). Every member of Parliament and the Provincial Assemblies files one each year, as at 30 June, due by 31 December (s. 137). The ECP publishes them in the Gazette and on ecp.gov.pk.

Add rows to any `*.csv` file in this folder, one row per person per statement:

```
person_id,fiscal_year,assets_pkr,liabilities_pkr,basis,source_title,source_url
shehbaz-sharif,2024-25,..., ...,Annual statement (s. 137),ECP Gazette 2025,https://www.ecp.gov.pk/...
```

- `person_id` must exist in `data/people.yaml` (add the person first if needed).
- `basis` is either `Annual statement (s. 137)` or `Nomination papers (s. 60)`.
- Net worth is shown as assets minus liabilities. These are declared values, often at historical cost.
- Leave a row out rather than guess. `npm run validate` rejects rows without a source URL.

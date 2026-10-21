# Editorial policy

The Pakistan Government Graph records how the Pakistani state is organised and who holds public office. This policy says what the project records, what it leaves out, and how it handles sources, sensitive content and corrections. Parts of it are enforced in code. Those parts name the file that enforces them.

The policy and the sensitive content it covers are reviewed by a Pakistani lawyer before the project is made public, with the Prevention of Electronic Crimes Act 2016 (as amended in 2025) and defamation law in mind.

## Scope

- The project records **public bodies, public offices and people in their public roles**: what they hold, since when, who appointed or elected them, and under which law.
- It does **not** record private individuals, home addresses, personal phone numbers, personal email addresses or photographs of people. Where contact details appear, they are the office's official ones.
- People appear because of an office they hold or held, or a party office. Nobody is added for any other reason.

## Sources

Every fact must come from a source that was actually consulted, and the source is cited on the record.

1. **Official records come first.** The Constitution, the Pakistan Code and provincial codes, the Gazette, ECP notifications and results, Cabinet Division, Establishment Division and provincial notifications, the websites of the assemblies, the Senate, the courts and the bodies themselves.
2. **Then state media reporting an official notification:** APP, Radio Pakistan, PTV.
3. **Then reputable independent press:** Dawn, The Express Tribune, The News, Business Recorder, Geo, Aaj. These are used mainly for dates and context.
4. **Encyclopedias, including Wikipedia, are never a source.** They may be used only to find an official source, which is then cited instead.

Who holds a post needs one official source, or two independent press sources that agree. Each record's confidence level reflects this: *high* only for an official source. Every source carries the date it was consulted, and every person record the date it was last checked. When sources disagree, the disagreement is logged in the public verification log rather than settled silently.

## Legal cases

**Not published at present.** Legal cases are hidden from the public site, `graph.json` and every export until the lawyer review is complete (decision of 30 September 2026; `PUBLISH.legalCases` in `src/lib/policy.ts`).

If they are published later, these rules apply:

- Only proceedings evidenced by a court order or judgment, or by a court's own cause list or website, are recorded. Allegations that never reached a court are not.
- The **current** status is always shown, and acquittals, quashed cases, withdrawals and stays are shown as prominently as the charge.
- Wording is neutral: "charged under…", "acquitted on…".
- Every record is re-checked at least every 90 days, or shown as stale.

## Declared assets

- Only statements **published by the Election Commission of Pakistan** are used: annual statements under section 137 of the Elections Act 2017, and nomination-paper declarations under section 60. This is enforced: a declared-asset record that does not cite an ECP publication fails validation (`ASSET_SOURCE_HOSTS` in `src/lib/policy.ts`).
- Values are labelled as **declared** values, often at historical cost, including spouse and dependants as the form requires. They are not audited net worth.
- Rankings compare one fiscal year at a time, and only once statements cover at least 90% of a house's seats for that year.

## Family ties

- A family tie is recorded only between two people who **both** hold or held a public office or a party office. Relatives with no public role are never recorded, and nor are minors.
- The tie must be stated by an official source, or by two independent reputable outlets. This is enforced at build time (`scripts/compile.ts`).

## Elections, and the "not legally elected" label

- Results are shown as declared by the ECP. Election tribunal petitions and court rulings are shown as recorded by the tribunal or court.
- **"Not legally elected."** Where the ECP's own Form 45 results (the polling-station counts) add up to a different winner from the ECP's Form 47 (the provisional consolidated result), the officeholder is labelled "not legally elected". This label:
  - is applied seat by seat, and only after the figures have been checked against the ECP's own Form 45 documents. Compilations by parties or observers are used only to find seats to check;
  - is always shown with its evidence next to it: the Form 45 totals, the Form 47 result and links to both documents;
  - is part of the lawyer review before launch.
- **"Not directly elected."** Officeholders who were not chosen by voters (members on reserved seats, senators, and unelected ministers, advisers and special assistants) carry a neutral tag that says how they were chosen.
- Apart from these labels, the project makes no claims of its own about the conduct of any election.

## Neutral wording

Descriptions say what a body, law or office does, not whether it is good. They don't use adjectives about people.

## Corrections and right of reply

- Anyone, including the people named, can ask for a correction using the **Correction request** form on the project's GitHub Issues page. A dedicated email address will be added when one exists.
- Requests are acknowledged within **7 days**.
- Accepted corrections are made in the data and logged publicly in the verification log (`data/verification.yaml`) with `status: corrected`, saying what changed and on what source.
- Where a person named disputes a record and the sources conflict, the conflict is logged and shown, rather than either side being silently preferred.

## Takedown requests

- Legal notices and takedown requests are made through the same Correction request form, or privately through the repository's security reporting route (see `SECURITY.md`) where the request contains personal information.
- Each request is reviewed promptly. While it is under review, the record concerned can be hidden from the public build.
- The outcome is recorded in the verification log, without personal details of the person who asked.

## Licence

The data is released under **CC BY 4.0** (see `LICENSE-DATA`). Attribute it as "Pakistan Government Graph". The code is under the MIT licence (`LICENSE`).

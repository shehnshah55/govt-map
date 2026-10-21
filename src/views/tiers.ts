/** The Federation and its seven units: ids, labels, their government body and headline posts. */
export const TIERS = ["pk", "pk-pb", "pk-sd", "pk-kp", "pk-ba", "pk-ict", "pk-gb", "pk-ajk"];
export const TIER_LABEL: Record<string, string> = {
  pk: "Federal",
  "pk-pb": "Punjab",
  "pk-sd": "Sindh",
  "pk-kp": "Khyber Pakhtunkhwa",
  "pk-ba": "Balochistan",
  "pk-ict": "Islamabad",
  "pk-gb": "Gilgit-Baltistan",
  "pk-ajk": "AJK",
};
export const TIER_GOVT: Record<string, string> = {
  pk: "fed-federation",
  "pk-pb": "pb-government",
  "pk-sd": "sd-government",
  "pk-kp": "kp-government",
  "pk-ba": "ba-government",
  "pk-ict": "fed-ict-administration",
  "pk-gb": "gb-government",
  "pk-ajk": "ajk-government",
};
export const TIER_HEADS: Record<string, [string, string][]> = {
  pk: [["President", "fed-president"], ["Prime Minister", "fed-prime-minister"], ["Chief Justice", "fed-chief-justice"], ["Speaker NA", "fed-na-speaker"]],
  "pk-pb": [["Governor", "pb-governor"], ["Chief Minister", "pb-chief-minister"], ["Chief Justice LHC", "pb-hc-chief-justice"]],
  "pk-sd": [["Governor", "sd-governor"], ["Chief Minister", "sd-chief-minister"], ["Mayor of Karachi", "sd-mayor"]],
  "pk-kp": [["Governor", "kp-governor"], ["Chief Minister", "kp-chief-minister"], ["Speaker", "kp-speaker"]],
  "pk-ba": [["Governor", "ba-governor"], ["Chief Minister", "ba-chief-minister"], ["Speaker", "ba-speaker"]],
  "pk-ict": [["Chief Commissioner", "fed-ict-chief-commissioner"], ["Chief Justice IHC", "fed-ihc-chief-justice"]],
  "pk-gb": [["Governor", "gb-governor"], ["Chief Minister", "gb-chief-minister"]],
  "pk-ajk": [["President", "ajk-president"], ["Prime Minister", "ajk-prime-minister"]],
};

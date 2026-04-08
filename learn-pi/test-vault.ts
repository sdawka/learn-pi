import { Vault } from "./lib/vault.ts";
import { walkItems } from "./lib/report-data.ts";

const v = new Vault("/tmp/learn-pi-ui-verify-rich/vault");
const items = walkItems(v, "it");
console.log("Items found:", items.length);
items.forEach(item => {
  console.log(`  - ${item.kind}/${item.rel}: kc_type=${item.data.kc_type}, mastery=${item.data.mastery}`);
});

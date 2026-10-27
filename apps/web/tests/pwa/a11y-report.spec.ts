import { test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROUTES = ["/", "/features", "/privacy", "/sign-in"];

test("a11y full report", async ({ page }) => {
  for (const path of ROUTES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

     
    console.log(`\n\n========== ${path} — ${results.violations.length} violations ==========`);
    for (const v of results.violations) {
       
      console.log(`\n[${v.impact}] ${v.id}`);
       
      console.log(`  ${v.description}`);
       
      console.log(`  Help: ${v.helpUrl}`);
       
      console.log(`  Nodes (${v.nodes.length}):`);
      v.nodes.slice(0, 5).forEach((n, i) => {
         
        console.log(`    ${i + 1}. target=${JSON.stringify(n.target)}`);
         
        console.log(`       html=${n.html.slice(0, 120)}`);
      });
    }
  }
});

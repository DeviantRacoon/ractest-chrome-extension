import type { TestProfile, TestStep } from "../types";

export function generatePlaywrightScript(
  profile: TestProfile,
  allProfiles: TestProfile[],
): string {
  let script = `import { test, expect } from '@playwright/test';\n\n`;

  script += `test('${profile.name.replace(/'/g, "\\'")}', async ({ page }) => {
`;

  // Navigate to initial URL
  if (profile.url && profile.url !== "Secuencia Combinada") {
    script += `  // Initialize Flow: ${profile.name}\n`;
    script += `  await page.goto('${profile.url.replace(/'/g, "\\'")}');\n\n`;
  }

  const indentParams = (level: number) => "  ".repeat(level + 1);
  const processedRecipeIds = new Set<string>();

  const processSteps = (steps: TestStep[], level: number) => {
    const indent = indentParams(level);

    for (const step of steps) {
      if (step.delay > 0) {
        script += `${indent}await page.waitForTimeout(${step.delay});\n`;
      }

      // Protect single quotes in the selector string
      const sel = step.selector.replace(/'/g, "\\'");

      switch (step.action) {
        case "CLICK":
          script += `${indent}await page.locator('${sel}').click();\n`;
          break;
        case "TYPE": {
          let val = step.value?.replace(/'/g, "\\'") || "";
          if (step.useFakeData && step.fakeDataType) {
            val = `\${Math.random().toString(36).substring(7)}_${step.fakeDataType}`;
            script += `${indent}await page.locator('${sel}').fill(\`${val}\`);\n`;
          } else {
            script += `${indent}await page.locator('${sel}').fill('${val}');\n`;
          }
          break;
        }
        case "SELECT":
          script += `${indent}await page.locator('${sel}').selectOption('${step.value?.replace(/'/g, "\\'")}');\n`;
          break;
        case "CHECK":
          script += `${indent}await page.locator('${sel}').check();\n`;
          break;
        case "UNCHECK":
          script += `${indent}await page.locator('${sel}').uncheck();\n`;
          break;
        case "ASSERT":
          if (step.uniqueText && step.value) {
            const val = step.value.replace(/'/g, "\\'");
            script += `${indent}await expect(page.locator('${sel}')).toContainText('${val}');\n`;
          } else {
            script += `${indent}await expect(page.locator('${sel}')).toBeVisible();\n`;
          }
          break;
        case "DIVIDER":
          script += `\n${indent}// --- ${step.value || "Divider"} ---\n`;
          break;
        case "RECIPE": {
          const nestedRecipeId = step.value;
          if (!nestedRecipeId) break;

          if (processedRecipeIds.has(nestedRecipeId)) {
            script += `${indent}// Warning: Circular dependency detected for nested recipe ID ${nestedRecipeId}\n`;
            break;
          }

          const nestedProfile = allProfiles.find(
            (p) => p.id === nestedRecipeId,
          );
          if (!nestedProfile) {
            script += `${indent}// Warning: Nested recipe not found for ID ${nestedRecipeId}\n`;
            break;
          }

          script += `\n${indent}// --- Nested Flow Start: ${nestedProfile.name} ---\n`;
          processedRecipeIds.add(nestedRecipeId);
          processSteps(nestedProfile.steps, level); // Recursive execution
          processedRecipeIds.delete(nestedRecipeId);
          script += `${indent}// --- Nested Flow End: ${nestedProfile.name} ---\n\n`;
          break;
        }
        case "FINISH":
          script += `${indent}// END OF FLOW\n`;
          break;
      }
    }
  };

  processSteps(profile.steps, 0);

  script += `});\n`;
  return script;
}

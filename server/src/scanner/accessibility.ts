import AxeBuilder from '@axe-core/playwright';
import type { Page } from 'playwright';
import type { AccessibilityFinding } from '../../../src/server/types/scan-types.ts';

export async function runAccessibilityScan(
  page: Page,
  pageUrl: string,
  newId: () => string,
): Promise<AccessibilityFinding[]> {
  const results = await new AxeBuilder({ page }).analyze();
  const findings: AccessibilityFinding[] = [];
  for (const v of results.violations) {
    for (const node of v.nodes.slice(0, 10)) {
      findings.push({
        id: newId(),
        rule: v.id,
        impact: (v.impact as AccessibilityFinding['impact']) || 'moderate',
        description: v.description,
        helpUrl: v.helpUrl,
        elementHtml: node.html.slice(0, 500),
        selector: node.target.join(' '),
        pageUrl,
      });
    }
  }
  return findings;
}

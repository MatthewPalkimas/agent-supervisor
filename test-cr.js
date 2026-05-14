#!/usr/bin/env node
// Quick test: run CR extraction against a real session jsonl
const fs = require('fs');
const path = require('path');

const jsonlPath = process.argv[2];
if (!jsonlPath) {
  console.error('Usage: node test-cr.js <path-to-session.jsonl>');
  process.exit(1);
}

const content = fs.readFileSync(jsonlPath, 'utf8');
const lines = content.split('\n').filter(Boolean);
const crLinks = [];

for (let li = 0; li < lines.length; li++) {
  try {
    const ev = JSON.parse(lines[li]);
    if (ev.kind === 'AssistantMessage') {
      const hasCrTool = (ev.data?.content ?? []).some(b =>
        b.kind === 'toolUse' && (
          b.data?.name === 'CRRevisionCreator' ||
          b.data?.name === 'CodeReviewWriteActions' ||
          (b.data?.name === 'shell' && /(?:^|\s)cr(?:\s|$)/.test(b.data?.input?.command ?? '') && !/--help|-h\b/.test(b.data?.input?.command ?? ''))
        )
      );
      if (hasCrTool) {
        console.log(`[line ${li}] CR tool call found:`, (ev.data?.content ?? []).find(b => b.kind === 'toolUse')?.data?.input?.command ?? '(non-shell tool)');
        for (let ti = li + 1; ti < lines.length; ti++) {
          try {
            const tr = JSON.parse(lines[ti]);
            if (tr.kind === 'ToolResults') {
              const matches = JSON.stringify(tr.data).match(/CR-[0-9]{6,}/g);
              console.log(`  -> ToolResults at line ${ti}, CR matches:`, matches ?? 'none');
              break;
            }
            if (tr.kind === 'AssistantMessage') { console.log(`  -> no ToolResults before next turn`); break; }
          } catch {}
        }
      }
    }
  } catch {}
}

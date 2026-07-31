
import fs from 'fs';

const content = fs.readFileSync('src/pages/ManageProducts.tsx', 'utf8');

// Simple regex to find <div, <motion.div, </div, </motion.div
const tagRegex = /<(div|motion\.div)|<\/(div|motion\.div)>/g;

let match;
let stack = [];
let balance = 0;

const lines = content.split('\n');
const lineOffsets = [];
let offset = 0;
for (const line of lines) {
  lineOffsets.push(offset);
  offset += line.length + 1;
}

function getLine(pos) {
  for (let i = 0; i < lineOffsets.length; i++) {
    if (lineOffsets[i] > pos) return i;
  }
  return lineOffsets.length;
}

while ((match = tagRegex.exec(content)) !== null) {
  const tag = match[0];
  const pos = match.index;
  const line = getLine(pos);

  if (tag.startsWith('</')) {
    if (stack.length === 0) {
      console.log(`Extra closing tag ${tag} at line ${line}`);
    } else {
      stack.pop();
    }
  } else {
    stack.push({ tag, line });
  }
}

if (stack.length > 0) {
  console.log('Unclosed tags:');
  for (const s of stack) {
    console.log(`${s.tag} opened at line ${s.line}`);
  }
} else {
  console.log('All tags balanced!');
}

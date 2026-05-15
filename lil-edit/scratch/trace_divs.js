
import fs from 'fs';

const content = fs.readFileSync('src/pages/ManageProducts.tsx', 'utf8');
const lines = content.split('\n');

let stack = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const tags = line.match(/<(div|\/div|motion\.div|\/motion\.div)/g);
  
  if (tags) {
    for (const tag of tags) {
      if (tag.startsWith('</')) {
        const expected = tag.slice(2);
        const actual = stack.pop();
        if (actual !== expected) {
          console.log(`Mismatch at line ${i + 1}: expected closing for ${actual}, but found ${tag}`);
        }
      } else {
        stack.push(tag.slice(1));
      }
    }
  }
}

console.log('Final stack:', stack);
